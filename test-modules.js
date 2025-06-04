// Простой тест для проверки что все модули загружаются
import { PROXY_CONFIG } from './modules/config.js';
import { log } from './modules/logger.js';
import { getProxyHandler } from './modules/proxyHandler.js';

console.log('🧪 Testing module imports...');

try {
  console.log('✅ Config loaded:', PROXY_CONFIG.apiKey ? 'API key present' : 'No API key');
  console.log('✅ Logger loaded, testing log function...');
  log('Test log message', 'info');
  
  console.log('✅ ProxyHandler loading...');
  const proxyHandler = await getProxyHandler();
  console.log('✅ ProxyHandler loaded successfully');
  
  console.log('🎉 ALL MODULES LOADED SUCCESSFULLY!');
  
} catch (error) {
  console.error('❌ MODULE LOADING ERROR:', error.message);
  process.exit(1);
} 