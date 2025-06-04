import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { log } from './logger.js';
import { PROXY_CONFIG } from './config.js';

/**
 * Class to handle proxy rotation and management
 */
export class ProxyHandler {
  constructor() {
    this.proxyList = [];
    this.currentProxyIndex = 0;
    this.isInitialized = false;
    this.stats = {
      totalRequests: 0,
      protectionHits: 0,
      proxyRequests: 0,
      proxySuccesses: 0,
      proxyFailures: 0
    };
    this.proxyStats = {}; // New: Track per-proxy stats
    this.failureCounter = 0;
  }

  /**
   * Initialize the proxy handler by fetching proxies from WebShare - как в index.js
   */
  async initialize() {
    try {
      log('Initializing proxy handler...', 'proxy');
      const proxies = await this.fetchProxiesFromWebShare();
      if (proxies && proxies.length > 0) {
        this.proxyList = proxies;
        this.isInitialized = true;
        log(`Successfully initialized proxy handler with ${proxies.length} proxies`, 'proxy');
        return true;
      } else {
        log('Failed to fetch proxies from WebShare', 'error');
        return false;
      }
    } catch (error) {
      log(`Error initializing proxy handler: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Fetch proxies from WebShare.io API - используем точно такую же логику как в index.js
   */
  async fetchProxiesFromWebShare() {
    try {
      log('Fetching proxies from WebShare.io...', 'proxy');
      
      // Используем тот же API ключ что и в index.js
      const WEBSHARE_API_KEY = 'qf8qedpyxethbo8qjdhiol5r4js7lm8jmcs59pkf';
      
      // Log the API key for debugging (hide most of it)
      const apiKeySafe = WEBSHARE_API_KEY.length > 8 
        ? WEBSHARE_API_KEY.substring(0, 4) + '...' + WEBSHARE_API_KEY.substring(WEBSHARE_API_KEY.length - 4)
        : '****';
      log(`Using WebShare API key: ${apiKeySafe}`, 'proxy');
      
      // Используем точно такой же endpoint как в index.js
      const apiUrl = 'https://proxy.webshare.io/api/proxy/list/';
      
      log(`API URL: ${apiUrl}`, 'debug');
      log(`API Key length: ${WEBSHARE_API_KEY ? WEBSHARE_API_KEY.length : 0} chars`, 'debug');
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Token ${WEBSHARE_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorMsg = `API responded with status ${response.status}`;
        const responseText = await response.text();
        log(`Proxy API error: ${errorMsg}`, 'error');
        log(`Response body: ${responseText.substring(0, 200)}...`, 'debug');
        return [];
      }

      const data = await response.json();
      
      // Используем точно такую же логику парсинга как в index.js
      const proxies = (data.results || []).map(proxy => {
        const port = proxy.ports && proxy.ports.http ? proxy.ports.http : 0;
        
        return {
          host: proxy.proxy_address || '',
          port: port,
          username: proxy.username || '',
          password: proxy.password || '',
          protocol: 'http',
          country: proxy.country_code || 'Unknown',
          failed: false,
          lastUsed: null,
          workingStatus: null,
          failCount: 0
        };
      });

      // Фильтруем только валидные прокси
      const validProxies = proxies.filter(p => p.host && p.port > 0 && p.username && p.password);

      log(`Successfully fetched ${validProxies.length} valid proxies from Webshare.io`, 'proxy');
      console.log(`PROXY FETCH COMPLETED SUCCESSFULLY: Found ${validProxies.length} valid proxies`);
      
      return validProxies;
    } catch (error) {
      log(`PROXY ERROR: ${error.message}`, 'error');
      log(`Error stack: ${error.stack}`, 'debug');
      return [];
    }
  }

  /**
   * Test if a proxy works - используем точно такую же логику как в index.js
   */
  async testProxy(proxyConfig) {
    try {
      if (!proxyConfig || !proxyConfig.host || !proxyConfig.port) {
        log(`Invalid proxy configuration: ${JSON.stringify(proxyConfig)}`, 'debug');
        return false;
      }
      
      log(`Testing proxy ${proxyConfig.host}:${proxyConfig.port}`, 'proxy');
      
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          `--proxy-server=${proxyConfig.host}:${proxyConfig.port}`
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        await page.authenticate({
          username: proxyConfig.username,
          password: proxyConfig.password
        });
        
        log(`Authenticated with proxy ${proxyConfig.host}:${proxyConfig.port}`, 'debug');
        
        const response = await page.goto('https://example.org', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000  // Увеличиваем timeout для медленных прокси
        });
        
        const status = response.status();
        const isSuccess = status === 200;
        
        log(`Proxy test ${isSuccess ? 'successful' : 'failed'}: ${proxyConfig.host}:${proxyConfig.port} (status: ${status})`, 'proxy');
        return isSuccess;
      } finally {
        await browser.close();
      }
    } catch (error) {
      log(`Proxy test failed for ${proxyConfig.host}:${proxyConfig.port}: ${error.message}`, 'debug');
      this.markProxyAsFailed(proxyConfig);
      return false;
    }
  }





  /**
   * Get next working proxy - используем логику как в index.js
   */
  async getNextWorkingProxy() {
    log('Getting next working proxy', 'debug');
    
    if (this.proxyList.length === 0) {
      const proxies = await this.fetchProxiesFromWebShare();
      if (proxies.length === 0) {
        log('No proxies available', 'error');
        return null;
      }
      this.proxyList = proxies;
    }
    
    let attempts = 0;
    const maxAttempts = this.proxyList.length;
    
    while (attempts < maxAttempts) {
      if (this.currentProxyIndex >= this.proxyList.length) {
        this.currentProxyIndex = 0;
      }
      
      const proxy = this.proxyList[this.currentProxyIndex];
      this.currentProxyIndex++;
      attempts++;
      
      if (!proxy.failed) {
        proxy.lastUsed = Date.now();
        log(`Selected proxy: ${proxy.host}:${proxy.port} with auth ${proxy.username}:***`, 'proxy');
        
        if (!proxy.host || !proxy.port || !proxy.username || !proxy.password) {
          log(`Invalid proxy configuration: ${JSON.stringify({
            hasHost: !!proxy.host,
            hasPort: !!proxy.port,
            hasUsername: !!proxy.username,
            hasPassword: !!proxy.password
          })}`, 'debug');
          proxy.failed = true;
          continue;
        }
        
        return proxy;
      }
    }
    
    log('All proxies have failed, resetting failure status', 'warning');
    this.proxyList.forEach(proxy => {
      proxy.failed = false;
    });
    
    const firstProxy = this.proxyList[0];
    if (firstProxy) {
      firstProxy.lastUsed = Date.now();
      log(`Reset all proxies, using: ${firstProxy.host}:${firstProxy.port}`, 'proxy');
      return firstProxy;
    }
    
    log('No valid proxies found even after reset', 'error');
    return null;
  }

  /**
   * Mark a proxy as failed - используем логику как в index.js
   */
  markProxyAsFailed(proxy, reason = 'PROXY_FAILED') {
    if (!proxy) return;
    
    proxy.failed = true;
    proxy.failCount = (proxy.failCount || 0) + 1;
    proxy.lastFailTime = Date.now();
    proxy.workingStatus = false;
    
    const countryEmoji = getCountryEmoji(proxy.country);
    log(`Marked proxy ${countryEmoji} ${proxy.host}:${proxy.port} as failed (reason: ${reason}, fails: ${proxy.failCount})`, 'proxy');
    
    // Обновляем статистику
    this.trackProxyUsage(proxy, false);
  }

  /**
   * Register a protection hit to track when we need to switch to proxies
   */
  registerProtectionHit() {
    this.stats.protectionHits++;
    this.failureCounter++;
    
    log(`Bot protection detected. Total hits: ${this.stats.protectionHits}`, 'proxy');
    
    // Return true if we should switch to using proxies
    return this.failureCounter >= PROXY_CONFIG.switchProxyAfterFailures;
  }

  /**
   * Get the total number of protection hits detected
   * @returns {number} - Total protection hits
   */
  getProtectionHitCount() {
    return this.stats.protectionHits || 0;
  }
  
  /**
   * Alias for getProtectionHitCount to ensure backward compatibility
   * @returns {number} - Total protection hits
   */
  getProtectionHits() {
    return this.getProtectionHitCount();
  }

  /**
   * Track usage for a specific proxy
   */
  trackProxyUsage(proxy, success) {
    if (!proxy) return;
    
    const proxyKey = `${proxy.host}:${proxy.port}`;
    
    if (!this.proxyStats[proxyKey]) {
      this.proxyStats[proxyKey] = {
        host: proxy.host,
        port: proxy.port,
        country: proxy.country,
        uses: 0,
        successes: 0,
        failures: 0
      };
    }
    
    this.proxyStats[proxyKey].uses++;
    if (success) {
      this.proxyStats[proxyKey].successes++;
    } else {
      this.proxyStats[proxyKey].failures++;
    }
    
    // Log the update for immediate feedback - but with a clearer format
    const stats = this.proxyStats[proxyKey];
    const successRate = stats.uses > 0 ? (stats.successes / stats.uses * 100).toFixed(1) : 0;
    const statusEmoji = successRate >= 70 ? '🟢' : (successRate >= 40 ? '🟡' : '🔴');
    const countryEmoji = getCountryEmoji(proxy.country);
    
    log(`${statusEmoji} Proxy ${countryEmoji} ${proxy.host}:${proxy.port} now has total uses: ${stats.uses} (${stats.successes} success/${stats.failures} fail) | Rate: ${successRate}%`, 'proxy');
  }

  /**
   * Get stats for a specific proxy
   */
  getProxyStats(proxyKey) {
    return this.proxyStats[proxyKey];
  }

  /**
   * Print detailed stats for each proxy
   */
  printProxyStats() {
    // Sort proxies by usage
    const sortedProxies = Object.values(this.proxyStats).sort((a, b) => b.uses - a.uses);
    
    if (sortedProxies.length === 0) {
      log('No proxy usage statistics available yet', 'info');
      return;
    }
    
    log('┌─────────────── PROXY USAGE STATISTICS ───────────────┐', 'info');
    log('│ IP:PORT                 │ USES (S/F)     │ RATE      │', 'info');
    log('├─────────────────────────┼────────────────┼───────────┤', 'info');
    
    for (const proxy of sortedProxies) {
      const successRate = proxy.uses > 0 ? (proxy.successes / proxy.uses * 100).toFixed(1) : 0;
      
      // Use emojis to visualize success rate
      let statusEmoji = '';
      if (successRate >= 70) {
        statusEmoji = '🟢'; // Green - good performance
      } else if (successRate >= 40) {
        statusEmoji = '🟡'; // Yellow - moderate performance
      } else {
        statusEmoji = '🔴'; // Red - poor performance
      }
      
      const countryEmoji = getCountryEmoji(proxy.country);
      const usageInfo = `${proxy.uses} (${proxy.successes}/${proxy.failures})`;
      const ipPort = `${proxy.host}:${proxy.port}`;
      
      log(`│ ${statusEmoji} ${countryEmoji} ${ipPort.padEnd(15)} │ ${usageInfo.padEnd(13)} │ ${successRate}%${' '.repeat(7 - successRate.toString().length)} │`, 'info');
    }
    
    log('└─────────────────────────┴────────────────┴───────────┘', 'info');
  }

  /**
   * Register a successful request with or without proxy
   */
  registerSuccess(usedProxy = false, proxy = null) {
    this.stats.totalRequests++;
    
    if (usedProxy) {
      this.stats.proxyRequests++;
      this.stats.proxySuccesses++;
      if (proxy) {
        this.trackProxyUsage(proxy, true);
      }
    }
    
    // Reset failure counter after success
    this.failureCounter = 0;
  }

  /**
   * Register a failed request with proxy
   */
  registerProxyFailure(proxy = null) {
    this.stats.proxyRequests++;
    this.stats.proxyFailures++;
    
    if (proxy) {
      this.trackProxyUsage(proxy, false);
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      proxyCount: this.proxyList.length,
      proxySuccessRate: this.stats.proxyRequests > 0 
        ? (this.stats.proxySuccesses / this.stats.proxyRequests * 100).toFixed(2) + '%' 
        : 'N/A'
    };
  }

  /**
   * Print current statistics
   */
  printStats() {
    const stats = this.getStats();
    const now = new Date().toISOString();
    
    log('┌─────────────── PROXY & REQUEST STATISTICS ───────────────┐', 'info');
    log(`│ Timestamp: ${now.padEnd(40)} │`, 'info');
    log(`│ Total Requests: ${stats.totalRequests.toString().padEnd(35)} │`, 'info');
    log(`│ Bot Protection Hits: ${stats.protectionHits.toString().padEnd(31)} │`, 'info');
    log(`│ Proxy Requests: ${stats.proxyRequests.toString().padEnd(34)} │`, 'info');
    log(`│ Proxy Successes: ${stats.proxySuccesses.toString().padEnd(33)} │`, 'info');
    log(`│ Proxy Failures: ${stats.proxyFailures.toString().padEnd(34)} │`, 'info');
    log(`│ Proxy Success Rate: ${stats.proxySuccessRate.padEnd(31)} │`, 'info');
    log(`│ Available Proxies: ${stats.proxyCount.toString().padEnd(31)} │`, 'info');
    log('└──────────────────────────────────────────────────────────┘', 'info');
    
    // Print per-proxy statistics
    this.printProxyStats();
  }
}

/**
 * Get emoji flag for country code
 */
export function getCountryEmoji(countryCode) {
  if (!countryCode || countryCode === 'Unknown') return '🌐';
  
  // Common country codes
  const countryEmojis = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'UK': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺', 
    'FR': '🇫🇷', 'DE': '🇩🇪', 'IT': '🇮🇹', 'JP': '🇯🇵', 'RU': '🇷🇺',
    'CN': '🇨🇳', 'BR': '🇧🇷', 'IN': '🇮🇳', 'ES': '🇪🇸', 'NL': '🇳🇱',
    'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'PL': '🇵🇱',
    'CZ': '🇨🇿', 'AT': '🇦🇹', 'CH': '🇨🇭', 'BE': '🇧🇪', 'IE': '🇮🇪',
    'NZ': '🇳🇿', 'SG': '🇸🇬', 'HK': '🇭🇰', 'MX': '🇲🇽', 'AR': '🇦🇷',
    'CL': '🇨🇱', 'CO': '🇨🇴', 'PE': '🇵🇪', 'UA': '🇺🇦', 'RS': '🇷🇸',
    'LT': '🇱🇹'
  };
  
  // Try to convert countryCode to uppercase and get emoji
  const code = countryCode.toUpperCase();
  return countryEmojis[code] || '🏳️';
}

// Singleton instance
let proxyHandlerInstance = null;

/**
 * Get the proxy handler instance (singleton)
 */
export const getProxyHandler = async () => {
  if (!proxyHandlerInstance) {
    proxyHandlerInstance = new ProxyHandler();
    await proxyHandlerInstance.initialize();
  }
  return proxyHandlerInstance;
};

export default {
  getProxyHandler,
  getCountryEmoji
};