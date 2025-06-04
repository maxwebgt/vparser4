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
   * Initialize the proxy handler by fetching proxies from WebShare
   */
  async initialize() {
    if (!PROXY_CONFIG.useProxy) {
      log('Proxy usage is disabled in configuration', 'proxy');
      return false;
    }

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
   * Fetch proxies from WebShare.io API
   */
  async fetchProxiesFromWebShare() {
    try {
      log('Fetching proxies from WebShare.io...', 'proxy');
      
      // Log the API key for debugging (hide most of it)
      const apiKeySafe = PROXY_CONFIG.apiKey.length > 8 
        ? PROXY_CONFIG.apiKey.substring(0, 4) + '...' + PROXY_CONFIG.apiKey.substring(PROXY_CONFIG.apiKey.length - 4)
        : '****';
      log(`Using WebShare API key: ${apiKeySafe}`, 'proxy');
      
      // Try the simpler API endpoint first (similar to proxyManager.js approach)
      let response = await fetch('https://proxy.webshare.io/api/proxy/list/', {
        method: 'GET',
        headers: {
          'Authorization': `Token ${PROXY_CONFIG.apiKey}`
        }
      });

      // If that fails, try the v2 API with correct parameters
      if (!response.ok) {
        log(`First API attempt failed (${response.status}). Trying v2 endpoint...`, 'proxy');
        
        response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/', {
          method: 'GET',
          headers: {
            'Authorization': `Token ${PROXY_CONFIG.apiKey}`
          }
        });
        
        // If that also fails, try with mode as query parameter (not in body)
        if (!response.ok) {
          log(`Second API attempt failed (${response.status}). Trying with mode parameter...`, 'proxy');
          
          response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25', {
            method: 'GET',
            headers: {
              'Authorization': `Token ${PROXY_CONFIG.apiKey}`
            }
          });
        }
      }

      // Log response status for debugging
      log(`WebShare API response status: ${response.status} ${response.statusText}`, 'proxy');

      if (!response.ok) {
        // Try to extract error details from response
        let errorDetails = '';
        try {
          const errorData = await response.json();
          errorDetails = JSON.stringify(errorData);
        } catch (e) {
          // If we can't parse JSON, use text instead
          errorDetails = await response.text();
        }
        
        throw new Error(`WebShare API error: ${response.status} ${response.statusText} - ${errorDetails}`);
      }

      const data = await response.json();
      
      // Log just the count and first proxy as sample (not all proxies)
      log(`API Response: Found ${data.count || (data.results ? data.results.length : 0)} proxies`, 'proxy');
      
      // Better debugging of response structure with just one proxy as sample
      if (data.results && data.results.length > 0) {
        const sampleProxy = data.results[0];
        log(`Sample proxy structure: ${JSON.stringify(sampleProxy)}`, 'proxy');
      }
      
      // Check if we have results directly or in a results array
      const proxyList = data.results || data;
      
      if (!Array.isArray(proxyList) || proxyList.length === 0) {
        throw new Error('Invalid or empty response from WebShare API');
      }

      const proxies = proxyList.map(proxy => {
        // Fix: Check for ports in nested object (WebShare v2 API) vs direct port
        const httpPort = proxy.ports?.http || proxy.port_http || proxy.port;
        
        // Validate each proxy has required fields
        if (!proxy.proxy_address && !proxy.ip) {
          log(`Skipping proxy with missing address`, 'warning');
          return null;
        }
        
        if (!httpPort) {
          log(`Skipping proxy with missing port`, 'warning');
          return null;
        }
        
        return {
          host: proxy.proxy_address || proxy.ip,
          port: parseInt(httpPort, 10), // Use the correctly extracted port
          username: proxy.username,
          password: proxy.password,
          protocol: 'http',
          country: proxy.country_code || proxy.country || 'Unknown',
          lastUsed: null,
          workingStatus: null,
          failCount: 0
        };
      }).filter(proxy => proxy !== null); // Remove nulls

      log(`Fetched ${proxies.length} valid proxies from WebShare`, 'proxy');
      
      // No need to log each individual proxy
      return proxies;
    } catch (error) {
      log(`Error fetching proxies: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Test if a proxy works by connecting to example.org
   */
  async testProxy(proxyConfig) {
    try {
      // Ensure we have all required fields
      if (!proxyConfig.host || !proxyConfig.port || !proxyConfig.username || !proxyConfig.password) {
        log(`Cannot test proxy with missing data: ${JSON.stringify(proxyConfig)}`, 'error');
        return false;
      }
      
      log(`Testing proxy ${proxyConfig.host}:${proxyConfig.port}...`, 'proxy');
      
      // Try both testing methods
      const puppeteerSuccess = await this.testProxyWithPuppeteer(proxyConfig);
      if (puppeteerSuccess) {
        return true;
      }
      
      // If puppeteer test fails, try fetch method
      log(`Puppeteer test failed, trying fetch method...`, 'proxy');
      return await this.testProxyWithFetch(proxyConfig);
    } catch (error) {
      log(`Proxy ${proxyConfig.host} test failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Test proxy using Puppeteer
   */
  async testProxyWithPuppeteer(proxyConfig) {
    try {
      // Using Puppeteer to test the proxy
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          `--proxy-server=${proxyConfig.host}:${proxyConfig.port}`
        ]
      });

      const page = await browser.newPage();
      
      // Set proxy authentication
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });

      // Test with a simple request to example.org
      for (const testUrl of PROXY_CONFIG.testUrls) {
        try {
          log(`Testing proxy with URL: ${testUrl}`, 'debug');
          await page.goto(testUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 12000
          });
          
          // Check if we got a valid response
          const title = await page.title();
          log(`Page title: ${title}`, 'debug');
          
          await browser.close();
          log(`Proxy ${proxyConfig.host} is working correctly (Puppeteer)`, 'proxy');
          return true;
        } catch (e) {
          log(`Failed to test with ${testUrl}: ${e.message}`, 'debug');
          // Try next URL
        }
      }
      
      await browser.close();
      return false;
    } catch (error) {
      log(`Puppeteer test failed: ${error.message}`, 'debug');
      return false;
    }
  }

  /**
   * Test proxy using fetch and HttpsProxyAgent
   */
  async testProxyWithFetch(proxyConfig) {
    try {
      const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      
      // Test with a simple request
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Set a timeout
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      for (const testUrl of PROXY_CONFIG.testUrls) {
        try {
          log(`Testing proxy with fetch to ${testUrl}`, 'debug');
          const response = await fetch(testUrl, {
            signal,
            agent: proxyAgent,
            timeout: 10000
          });
          
          clearTimeout(timeoutId);
          
          if (response.status === 200) {
            log(`Proxy ${proxyConfig.host} is working correctly (Fetch)`, 'proxy');
            return true;
          }
        } catch (e) {
          log(`Fetch test to ${testUrl} failed: ${e.message}`, 'debug');
          // Try next URL
        }
      }
      
      return false;
    } catch (error) {
      log(`Fetch test failed: ${error.message}`, 'debug');
      return false;
    }
  }

  /**
   * Get the next working proxy
   */
  async getNextWorkingProxy() {
    if (!this.isInitialized || this.proxyList.length === 0) {
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          return null;
        }
      } else {
        return null;
      }
    }

    // Find a working proxy
    for (let i = 0; i < this.proxyList.length; i++) {
      // Rotate to the next proxy
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
      const proxy = this.proxyList[this.currentProxyIndex];

      // If testing is enabled, check if proxy works
      if (PROXY_CONFIG.testBeforeUse) {
        if (proxy.workingStatus === null || proxy.failCount > 0) {
          // Test the proxy if it hasn't been tested or previously failed
          const isWorking = await this.testProxy(proxy);
          proxy.workingStatus = isWorking;
          
          if (isWorking) {
            proxy.failCount = 0;
            proxy.lastUsed = new Date();
            return proxy;
          } else {
            proxy.failCount++;
            continue; // Try the next proxy
          }
        } else {
          // Use a previously tested working proxy
          proxy.lastUsed = new Date();
          return proxy;
        }
      } else {
        // If testing is disabled, just use the next proxy
        proxy.lastUsed = new Date();
        return proxy;
      }
    }

    // If we've gone through all proxies and none work
    log('No working proxies found after checking all available proxies', 'error');
    return null;
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
