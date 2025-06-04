import { chromium } from 'playwright';
import ProxyHandler from './modules/proxyHandler.js';

console.log('🧪 ТЕСТИРОВАНИЕ ПРОКСИ НА HTTPBIN.ORG\n');

const testProxy = async (proxy) => {
  console.log(`\n🔍 Тестируем прокси: ${proxy.country} ${proxy.host}:${proxy.port}`);
  
  let browser = null;
  let page = null;
  
  try {
    // Запускаем браузер с прокси
    browser = await chromium.launch({
      headless: true,
      proxy: {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    page = await browser.newPage();
    
    // Устанавливаем таймаут
    page.setDefaultTimeout(15000);
    
    // Проверяем IP через httpbin.org
    console.log('🌐 Переходим на httpbin.org/ip...');
    await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
    
    // Получаем информацию об IP
    const content = await page.textContent('pre');
    const ipData = JSON.parse(content);
    const currentIP = ipData.origin;
    
    console.log(`✅ Успешно! Текущий IP: ${currentIP}`);
    
    // Дополнительно проверяем user-agent
    await page.goto('https://httpbin.org/user-agent', { waitUntil: 'domcontentloaded' });
    const uaContent = await page.textContent('pre');
    const uaData = JSON.parse(uaContent);
    
    console.log(`🔍 User-Agent: ${uaData['user-agent']}`);
    
    return { success: true, ip: currentIP };
    
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const testWithoutProxy = async () => {
  console.log('\n🏠 Тестируем БЕЗ прокси (прямое подключение)');
  
  let browser = null;
  let page = null;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    
    await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
    
    const content = await page.textContent('pre');
    const ipData = JSON.parse(content);
    const currentIP = ipData.origin;
    
    console.log(`✅ Прямой IP: ${currentIP}`);
    
    return { success: true, ip: currentIP };
    
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

const main = async () => {
  try {
    // Сначала проверяем прямое подключение
    const directResult = await testWithoutProxy();
    const directIP = directResult.success ? directResult.ip : 'unknown';
    
    // Создаем proxy handler
    const proxyHandler = new ProxyHandler();
    
    // Загружаем прокси
    console.log('\n📥 Загружаем прокси из WebShare.io...');
    const proxiesLoaded = await proxyHandler.fetchProxies();
    
    if (!proxiesLoaded) {
      console.log('❌ Не удалось загрузить прокси. Завершаем тест.');
      return;
    }
    
    // Тестируем несколько прокси
    const maxTests = Math.min(5, proxyHandler.proxyList.length);
    console.log(`\n🧪 Тестируем ${maxTests} прокси из ${proxyHandler.proxyList.length} доступных:`);
    
    let workingProxies = 0;
    const testedIPs = new Set();
    testedIPs.add(directIP);
    
    for (let i = 0; i < maxTests; i++) {
      const proxy = proxyHandler.getNextProxy();
      if (!proxy) {
        console.log('❌ Нет доступных прокси для тестирования');
        break;
      }
      
      const result = await testProxy(proxy);
      
      if (result.success) {
        proxyHandler.markProxySuccess(proxy);
        workingProxies++;
        
        // Проверяем, что IP действительно изменился
        if (result.ip !== directIP) {
          console.log(`🎉 Прокси работает! IP изменился с ${directIP} на ${result.ip}`);
        } else {
          console.log(`⚠️ Прокси работает, но IP не изменился (${result.ip})`);
        }
        
        testedIPs.add(result.ip);
      } else {
        proxyHandler.markProxyFailed(proxy, result.error);
      }
      
      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Выводим итоговую статистику
    console.log('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
    proxyHandler.printStats();
    
    console.log(`\n🌐 Найдено уникальных IP: ${testedIPs.size}`);
    console.log(`📍 IP адреса: ${Array.from(testedIPs).join(', ')}`);
    
    if (workingProxies > 0) {
      console.log(`\n✅ Тест успешен! ${workingProxies} из ${maxTests} прокси работают`);
    } else {
      console.log('\n❌ Тест неудачен! Ни один прокси не работает');
    }
    
  } catch (error) {
    console.log(`❌ Критическая ошибка: ${error.message}`);
  }
};

// Запускаем тест
main().catch(console.error); 