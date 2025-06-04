/**
 * Proxy configuration - РАБОЧИЙ API КЛЮЧ ИЗ СТАРОГО ПРОЕКТА
 */
export const PROXY_CONFIG = {
  useProxy: true,
  switchProxyAfterFailures: 2, // После 2 неудач переключаемся на прокси
  webshareApiKey: 'qf8qedpyxethbo8qjdhiol5r4js7lm8jmcs59pkf', // РАБОЧИЙ КЛЮЧ!
  webshareApiUrl: 'https://proxy.webshare.io/api/proxy/list/',
  maxRetries: 3,
  timeout: 30000
};

export default {
  PROXY_CONFIG
}; 