import fetch from 'node-fetch';
import { log } from './logger.js';
import { PROXY_CONFIG } from './config.js';

/**
 * Class to handle proxy rotation and management - РАБОЧАЯ ВЕРСИЯ ИЗ СТАРОГО ПРОЕКТА
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
    this.proxyStats = {}; // Track per-proxy stats
    this.failureCounter = 0;
  }

  /**
   * Initialize the proxy handler by fetching proxies from WebShare - КАК В СТАРОМ ПРОЕКТЕ
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
   * Fetch proxies from WebShare.io API - ТОЧНО КАК В СТАРОМ ПРОЕКТЕ
   */
  async fetchProxiesFromWebShare() {
    try {
      log('Fetching proxies from WebShare.io...', 'proxy');
      
      // РАБОЧИЙ API ключ из старого проекта
      const WEBSHARE_API_KEY = PROXY_CONFIG.webshareApiKey;
      
      // Log the API key for debugging (hide most of it)
      const apiKeySafe = WEBSHARE_API_KEY.length > 8 
        ? WEBSHARE_API_KEY.substring(0, 4) + '...' + WEBSHARE_API_KEY.substring(WEBSHARE_API_KEY.length - 4)
        : '****';
      log(`Using WebShare API key: ${apiKeySafe}`, 'proxy');
      
      const apiUrl = PROXY_CONFIG.webshareApiUrl;
      
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
      
      // ТОЧНО такая же логика парсинга как в старом проекте
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
   * Get next working proxy - РАНДОМНЫЙ ВЫБОР ДЛЯ РЕАЛИСТИЧНОСТИ
   */
  async getNextWorkingProxy() {
    log('Getting next working proxy (random selection)', 'debug');
    
    if (this.proxyList.length === 0) {
      const proxies = await this.fetchProxiesFromWebShare();
      if (proxies.length === 0) {
        log('No proxies available', 'error');
        return null;
      }
      this.proxyList = proxies;
    }
    
    // Получаем список неблокированных прокси
    const availableProxies = this.proxyList.filter(proxy => !proxy.failed);
    
    if (availableProxies.length === 0) {
      log('All proxies have failed, resetting failure status', 'warning');
      
      // Сбрасываем статус всех прокси
      this.proxyList.forEach(proxy => {
        proxy.failed = false;
      });
      
      // Теперь все прокси доступны снова
      const resetProxy = this.proxyList[Math.floor(Math.random() * this.proxyList.length)];
      if (resetProxy) {
        resetProxy.lastUsed = Date.now();
        log(`Reset all proxies, randomly selected: ${resetProxy.host}:${resetProxy.port}`, 'proxy');
        return resetProxy;
      }
      
      log('No valid proxies found even after reset', 'error');
      return null;
    }
    
    // РАНДОМНЫЙ ВЫБОР из доступных прокси
    const randomIndex = Math.floor(Math.random() * availableProxies.length);
    const proxy = availableProxies[randomIndex];
    
    // Проверяем валидность прокси
    if (!proxy.host || !proxy.port || !proxy.username || !proxy.password) {
      log(`Invalid proxy configuration: ${JSON.stringify({
        hasHost: !!proxy.host,
        hasPort: !!proxy.port,
        hasUsername: !!proxy.username,
        hasPassword: !!proxy.password
      })}`, 'debug');
      proxy.failed = true;
      
      // Рекурсивно пробуем выбрать другой прокси
      return await this.getNextWorkingProxy();
    }
    
    proxy.lastUsed = Date.now();
    const countryEmoji = getCountryEmoji(proxy.country);
    log(`🎲 Randomly selected proxy: ${countryEmoji} ${proxy.host}:${proxy.port} with auth ${proxy.username}:*** (${availableProxies.length} available)`, 'proxy');
    
    return proxy;
  }

  /**
   * Mark a proxy as failed - КАК В СТАРОМ ПРОЕКТЕ
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
   */
  getProtectionHitCount() {
    return this.stats.protectionHits || 0;
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
    
    // Log the update for immediate feedback
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
   * Print current statistics
   */
  printStats() {
    const stats = {
      ...this.stats,
      proxyCount: this.proxyList.length,
      proxySuccessRate: this.stats.proxyRequests > 0 
        ? (this.stats.proxySuccesses / this.stats.proxyRequests * 100).toFixed(2) + '%' 
        : 'N/A'
    };
    
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
 * Get the proxy handler instance (singleton) - КАК В СТАРОМ ПРОЕКТЕ
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