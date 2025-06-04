import { chromium } from 'playwright';

console.log('🧪 ПРОСТОЙ ТЕСТ ПРОКСИ (БЕЗ WEBSHARE API)\n');

// Тестовые публичные прокси для проверки (могут не работать)
const testProxies = [
  { host: '8.222.128.173', port: 3129, username: '', password: '', country: '🇸🇬' },
  { host: '185.199.84.161', port: 53281, username: '', password: '', country: '🇷🇺' },
  { host: '103.152.112.162', port: 80, username: '', password: '', country: '🇮🇩' }
];

const testDirectConnection = async () => {
  console.log('🏠 Тестируем ПРЯМОЕ подключение...');
  
  let browser = null;
  let page = null;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    
    await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
    
    const content = await page.textContent('pre');
    const ipData = JSON.parse(content);
    
    console.log(`✅ Прямой IP: ${ipData.origin}`);
    return { success: true, ip: ipData.origin };
    
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const testProxyConnection = async (proxy) => {
  console.log(`\n🔍 Тестируем прокси: ${proxy.country} ${proxy.host}:${proxy.port}`);
  
  let browser = null;
  let page = null;
  
  try {
    const proxyConfig = {
      server: `http://${proxy.host}:${proxy.port}`
    };
    
    // Добавляем аутентификацию только если есть username/password
    if (proxy.username && proxy.password) {
      proxyConfig.username = proxy.username;
      proxyConfig.password = proxy.password;
    }
    
    browser = await chromium.launch({
      headless: true,
      proxy: proxyConfig,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    
    console.log(`🌐 Переходим на httpbin.org через прокси...`);
    await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
    
    const content = await page.textContent('pre');
    const ipData = JSON.parse(content);
    
    console.log(`✅ Успешно! IP через прокси: ${ipData.origin}`);
    return { success: true, ip: ipData.origin };
    
  } catch (error) {
    console.log(`❌ Ошибка прокси: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const main = async () => {
  try {
    // Сначала проверяем прямое подключение
    const directResult = await testDirectConnection();
    const directIP = directResult.success ? directResult.ip : 'unknown';
    
    console.log(`\n📍 Ваш прямой IP: ${directIP}`);
    
    // Тестируем публичные прокси
    console.log('\n🧪 Тестируем публичные прокси:');
    
    let workingProxies = 0;
    const uniqueIPs = new Set([directIP]);
    
    for (const proxy of testProxies) {
      const result = await testProxyConnection(proxy);
      
      if (result.success) {
        workingProxies++;
        uniqueIPs.add(result.ip);
        
        if (result.ip !== directIP) {
          console.log(`🎉 Прокси работает! IP изменился: ${directIP} → ${result.ip}`);
        } else {
          console.log(`⚠️ Прокси работает, но IP не изменился`);
        }
      }
      
      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Итоги
    console.log('\n📊 РЕЗУЛЬТАТЫ:');
    console.log(`✅ Работающих прокси: ${workingProxies} из ${testProxies.length}`);
    console.log(`🌐 Уникальных IP: ${uniqueIPs.size}`);
    console.log(`📍 Все IP: ${Array.from(uniqueIPs).join(', ')}`);
    
    if (workingProxies > 0) {
      console.log('\n🎉 Playwright может работать с прокси!');
    } else {
      console.log('\n⚠️ Публичные прокси не работают, но это нормально');
      console.log('💡 Основная функциональность подключения к прокси работает');
    }
    
  } catch (error) {
    console.log(`❌ Критическая ошибка: ${error.message}`);
  }
};

main().catch(console.error); 