import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { log } from './logger.js';
import { CONFIG } from './config.js';

// Get directory for current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Proxy management state
let proxies = [];
let currentProxyIndex = 0;
let proxyFailures = {};
let proxyUsageCounts = {};
let lastProxyFetch = 0;

// Fetch proxies from Webshare.io API
export const fetchProxiesFromApi = async () => {
  console.log('fetchProxiesFromApi called');
  
  try {
    log('Fetching proxies from Webshare.io API...', 'info');
    
    // Check if API key exists before making the request
    const apiKey = process.env.WEBSHARE_API_KEY;
    if (!apiKey) {
      log('No Webshare API key provided. Skipping proxy fetching.', 'warn');
      console.log('No Webshare API key provided in environment variables.');
      // Don't throw, just return empty array
      return [];
    }
    
    const apiUrl = 'https://proxy.webshare.io/api/v2/proxy/list/';
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });
    
    if (!response.ok) {
      const errorMsg = `API responded with status ${response.status}`;
      log(`Proxy API error: ${errorMsg}`, 'error');
      console.error(`Proxy API error: ${errorMsg}`);
      
      // Don't throw, just return empty array so script can continue
      return [];
    }
    
    const data = await response.json();
    
    // Process and store proxies
    proxies = (data.results || []).map(proxy => ({
      host: proxy.proxy_address,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      protocol: 'http',
      failed: false,
      lastUsed: null
    }));
    
    log(`Successfully fetched ${proxies.length} proxies from Webshare.io`, 'info');
    console.log(`PROXY FETCH COMPLETED SUCCESSFULLY: Found ${proxies.length} proxies`);
    
    return proxies;
  } catch (error) {
    console.error('PROXY ERROR:', error);
    log(`Error fetching proxies: ${error.message}`, 'error');
    // Return empty list but don't throw to allow script to continue
    return [];
  }
};

// Get next proxy based on usage and failure metrics
export const getNextProxy = async () => {
  // Make sure we have proxies
  if (proxies.length === 0) {
    await fetchProxiesFromApi();
    if (proxies.length === 0) {
      return null;
    }
  }
  
  // Find least used proxy that hasn't failed too much
  const sortedProxies = [...proxies].sort((a, b) => {
    // Prioritize proxies with fewer failures
    const aFailures = proxyFailures[a.id] || 0;
    const bFailures = proxyFailures[b.id] || 0;
    
    if (aFailures !== bFailures) {
      return aFailures - bFailures;
    }
    
    // Then consider usage count
    const aUsage = proxyUsageCounts[a.id] || 0;
    const bUsage = proxyUsageCounts[b.id] || 0;
    
    return aUsage - bUsage;
  });
  
  // Take the first proxy with acceptable failure rate
  for (const proxy of sortedProxies) {
    const failures = proxyFailures[proxy.id] || 0;
    if (failures < CONFIG.proxy.failureThreshold) {
      currentProxyIndex = proxies.indexOf(proxy);
      
      // Update usage stats
      proxyUsageCounts[proxy.id] = (proxyUsageCounts[proxy.id] || 0) + 1;
      proxy.lastUsed = Date.now();
      
      return proxy;
    }
  }
  
  // If all proxies have too many failures, reset failure counts and try again
  log('All proxies have exceeded failure threshold. Resetting failure counts.', 'warn');
  proxyFailures = {};
  return getNextProxy();
};

// Check if a proxy is working
export const testProxy = async (proxy) => {
  try {
    const proxyUrl = `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Set a timeout
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch('https://www.google.com', {
      signal,
      agent: proxyAgent,
      timeout: 10000
    });
    
    clearTimeout(timeoutId);
    
    return response.status === 200;
  } catch (error) {
    // Record failure
    proxyFailures[proxy.id] = (proxyFailures[proxy.id] || 0) + 1;
    log(`Proxy test failed for ${proxy.host}:${proxy.port}: ${error.message}`, 'warn');
    return false;
  }
};

// Get a verified working proxy
export const getNextWorkingProxy = async () => {
  console.log('getNextWorkingProxy called');
  
  // If no proxies available, return null
  if (proxies.length === 0) {
    log('No proxies available', 'warn');
    return null;
  }
  
  // Find a proxy that hasn't failed
  let attempts = 0;
  const maxAttempts = proxies.length;
  
  while (attempts < maxAttempts) {
    // Reset to beginning if we've reached the end
    if (currentProxyIndex >= proxies.length) {
      currentProxyIndex = 0;
    }
    
    const proxy = proxies[currentProxyIndex];
    currentProxyIndex++;
    attempts++;
    
    if (!proxy.failed) {
      proxy.lastUsed = Date.now();
      return proxy;
    }
  }
  
  // If all proxies have failed, reset them all and return the first one
  log('All proxies have failed, resetting failure status', 'warn');
  proxies.forEach(proxy => {
    proxy.failed = false;
  });
  
  const firstProxy = proxies[0];
  firstProxy.lastUsed = Date.now();
  return firstProxy;
};

// Mark a proxy as failed
export const markProxyAsFailed = (proxy) => {
  if (!proxy) return;
  
  // Find the proxy in our list
  const proxyInList = proxies.find(p => 
    p.host === proxy.host && 
    p.port === proxy.port && 
    p.username === proxy.username
  );
  
  if (proxyInList) {
    proxyInList.failed = true;
    log(`Marked proxy ${proxy.host}:${proxy.port} as failed`, 'debug');
  }
};

// Reset proxy failure count
export const resetProxyFailures = (proxy) => {
  if (!proxy) return;
  
  proxyFailures[proxy.id] = 0;
  log(`Reset failure count for proxy ${proxy.host}:${proxy.port}`, 'info');
};

// Get proxy statistics
export const getProxyStats = () => {
  return {
    totalProxies: proxies.length,
    failuresByProxy: { ...proxyFailures },
    usageByProxy: { ...proxyUsageCounts },
    lastFetch: new Date(lastProxyFetch).toISOString()
  };
};

export default {
  fetchProxiesFromApi,
  getNextProxy,
  getNextWorkingProxy,
  markProxyAsFailed,
  resetProxyFailures,
  getProxyStats
};
