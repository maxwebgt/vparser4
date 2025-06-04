/**
 * Simple proxy handler for WebShare.io proxies
 */
export class ProxyHandler {
  constructor() {
    this.proxyList = [];
    this.currentProxyIndex = 0;
    this.failedProxies = new Set(); // Храним неработающие прокси
    this.stats = {
      totalRequests: 0,
      protectionHits: 0,
      proxySuccesses: 0,
      proxyFailures: 0
    };
  }

  /**
   * Fetch proxies from WebShare.io API
   */
  async fetchProxies() {
    const API_KEY = 'qf8qedpyxethbo8qjdhiol5r4js7lm8jmcs59pkf'; // Исправленный ключ
    
    console.log('🌐 [PROXY] Fetching proxies from WebShare.io...');
    console.log(`🔑 [PROXY] Using API key: ${API_KEY.substring(0, 6)}...${API_KEY.slice(-6)}`);
    
    try {
      const response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25', {
        headers: {
          'Authorization': `Token ${API_KEY}`
        }
      });
      
      console.log(`📡 [PROXY] API Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Попробуем получить детали ошибки
        let errorDetails = '';
        try {
          const errorData = await response.json();
          errorDetails = JSON.stringify(errorData);
        } catch (e) {
          errorDetails = await response.text();
        }
        throw new Error(`WebShare API error: ${response.status} - ${errorDetails}`);
      }
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        this.proxyList = data.results.map(proxy => ({
          host: proxy.proxy_address,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
          country: this.getCountryFlag(proxy.country_code)
        }));
        
        console.log(`🌐 [PROXY] Successfully fetched ${this.proxyList.length} proxies`);
        return true;
      } else {
        throw new Error('No proxies returned from WebShare API');
      }
    } catch (error) {
      console.log(`❌ [ERROR] Failed to fetch proxies: ${error.message}`);
      return false;
    }
  }

  /**
   * Get country flag emoji
   */
  getCountryFlag(countryCode) {
    const flags = {
      'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'JP': '🇯🇵',
      'CA': '🇨🇦', 'AU': '🇦🇺', 'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴',
      'IT': '🇮🇹', 'ES': '🇪🇸', 'CH': '🇨🇭', 'SG': '🇸🇬', 'HK': '🇭🇰'
    };
    return flags[countryCode] || '🌍';
  }

  /**
   * Get next working proxy (random selection)
   */
  getNextProxy() {
    if (this.proxyList.length === 0) {
      console.log('❌ [ERROR] No proxies available!');
      return null;
    }
    
    // Фильтруем рабочие прокси
    const workingProxies = this.proxyList.filter(proxy => {
      const proxyKey = `${proxy.host}:${proxy.port}`;
      return !this.failedProxies.has(proxyKey);
    });
    
    if (workingProxies.length === 0) {
      console.log('❌ [ERROR] All proxies failed!');
      return null;
    }
    
    // Случайный выбор
    const randomIndex = Math.floor(Math.random() * workingProxies.length);
    const proxy = workingProxies[randomIndex];
    
    console.log(`🌐 [PROXY] Selected proxy: ${proxy.country} ${proxy.host}:${proxy.port} (${workingProxies.length} available)`);
    
    return proxy;
  }

  /**
   * Mark proxy as failed
   */
  markProxyFailed(proxy, reason = 'unknown') {
    if (!proxy) return;
    
    const proxyKey = `${proxy.host}:${proxy.port}`;
    this.failedProxies.add(proxyKey);
    this.stats.proxyFailures++;
    
    console.log(`🔴 [PROXY] Marked proxy ${proxy.country} ${proxy.host}:${proxy.port} as failed (reason: ${reason})`);
  }

  /**
   * Mark proxy as successful
   */
  markProxySuccess(proxy) {
    if (!proxy) return;
    
    this.stats.proxySuccesses++;
    console.log(`✅ [PROXY] Proxy ${proxy.country} ${proxy.host}:${proxy.port} working successfully`);
  }

  /**
   * Register bot protection hit
   */
  registerProtectionHit() {
    this.stats.protectionHits++;
    console.log(`🔒 [PROXY] Bot protection detected. Total hits: ${this.stats.protectionHits}`);
    
    // Используем прокси после 3 попыток
    return this.stats.protectionHits >= 3;
  }

  /**
   * Print current statistics
   */
  printStats() {
    const workingProxies = this.proxyList.length - this.failedProxies.size;
    const successRate = this.stats.proxySuccesses + this.stats.proxyFailures > 0 
      ? (this.stats.proxySuccesses / (this.stats.proxySuccesses + this.stats.proxyFailures) * 100).toFixed(1)
      : 'N/A';

    console.log('┌─────────────── PROXY STATISTICS ────────────────┐');
    console.log(`│ Total Proxies: ${this.proxyList.length}${' '.repeat(32 - String(this.proxyList.length).length)}│`);
    console.log(`│ Working Proxies: ${workingProxies}${' '.repeat(30 - String(workingProxies).length)}│`);
    console.log(`│ Failed Proxies: ${this.failedProxies.size}${' '.repeat(31 - String(this.failedProxies.size).length)}│`);
    console.log(`│ Protection Hits: ${this.stats.protectionHits}${' '.repeat(30 - String(this.stats.protectionHits).length)}│`);
    console.log(`│ Success Rate: ${successRate}%${' '.repeat(33 - String(successRate).length)}│`);
    console.log('└──────────────────────────────────────────────────┘');
  }

  /**
   * Quick proxy availability check
   */
  async checkProxyAvailability(proxy, timeout = 10000) {
    if (!proxy) return false;
    
    console.log(`🔍 [PROXY CHECK] Проверяем доступность ${proxy.country} ${proxy.host}:${proxy.port}...`);
    
    try {
      // Простая проверка HTTP соединения
      const testUrl = 'http://httpbin.org/ip';
      const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        // Note: fetch API doesn't support proxy directly in browser/Node.js
        // This is a simplified check - in real implementation we'd use a proxy library
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`✅ [PROXY CHECK] Прокси ${proxy.country} ${proxy.host}:${proxy.port} доступен`);
        return true;
      } else {
        console.log(`❌ [PROXY CHECK] Прокси ${proxy.country} ${proxy.host}:${proxy.port} вернул ${response.status}`);
        return false;
      }
      
    } catch (error) {
      console.log(`❌ [PROXY CHECK] Прокси ${proxy.country} ${proxy.host}:${proxy.port} недоступен: ${error.message}`);
      return false;
    }
  }
}

export default ProxyHandler; 