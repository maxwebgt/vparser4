import { chromium } from 'playwright';

console.log('🔍 ПРОВЕРКА СОСТОЯНИЯ IP И ДОСТУПА К САЙТУ\n');

const checkIPStatus = async () => {
  let browser = null;
  
  try {
    // Проверяем текущий IP
    console.log('1️⃣ Проверяем текущий IP через httpbin...');
    browser = await chromium.launch({ 
      headless: true,
      dumpio: true 
    });
    
    const page = await browser.newPage();
    
    await page.goto('https://httpbin.org/ip');
    const ipInfo = await page.textContent('pre') || await page.textContent('body');
    console.log(`   📄 Raw response: ${ipInfo}`);
    const currentIP = JSON.parse(ipInfo.trim()).origin;
    console.log(`   📍 Текущий IP: ${currentIP}`);
    
    await browser.close();
    
    // Проверяем доступ к vseinstrumenti.ru
    console.log('\n2️⃣ Тестируем доступ к vseinstrumenti.ru...');
    browser = await chromium.launch({ 
      headless: true,
      dumpio: true 
    });
    
    const testPage = await browser.newPage();
    
    // Логируем все ответы
    testPage.on('response', response => {
      if (response.url().includes('vseinstrumenti.ru')) {
        console.log(`   📥 [${response.status()}] ${response.url()}`);
        
        if (response.status() === 403) {
          console.log(`   🚫 БЛОКИРОВКА! IP ${currentIP} заблокирован`);
        }
      }
    });
    
    await testPage.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    });
    
    console.log('   🌐 Попытка 1: Главная страница...');
    const homeResponse = await testPage.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log(`   📊 Главная: ${homeResponse.status()}`);
    
    if (homeResponse.status() === 200) {
      console.log('   ✅ IP НЕ заблокирован - можем работать');
      
      // Тестируем установку города
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('   🌐 Попытка 2: Установка города...');
      
      const cityResponse = await testPage.goto('https://www.vseinstrumenti.ru/represent/change/?represent_id=1', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      console.log(`   📊 Город: ${cityResponse.status()}`);
      
    } else if (homeResponse.status() === 403) {
      console.log('   ❌ IP ЗАБЛОКИРОВАН - нужен прокси с первой попытки');
      
      // Анализируем тип блокировки
      const content = await testPage.content();
      if (content.includes('blocked') || content.includes('forbidden')) {
        console.log('   🔒 Тип: Антибот защита');
      } else {
        console.log('   🔒 Тип: Общая блокировка IP');
      }
    }
    
    await browser.close();
    
    // Проверяем через другой браузер (Firefox)
    console.log('\n3️⃣ Тестируем через Firefox для сравнения...');
    const firefox = await import('playwright').then(pw => pw.firefox);
    const ffBrowser = await firefox.launch({ 
      headless: true,
      dumpio: true 
    });
    
    const ffPage = await ffBrowser.newPage();
    
    ffPage.on('response', response => {
      if (response.url().includes('vseinstrumenti.ru')) {
        console.log(`   🦊 [${response.status()}] ${response.url()}`);
      }
    });
    
    await ffPage.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
    });
    
    const ffResponse = await ffPage.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log(`   🦊 Firefox результат: ${ffResponse.status()}`);
    
    if (ffResponse.status() !== homeResponse.status()) {
      console.log('   ⚠️ РАЗНЫЕ результаты в Chrome и Firefox - проблема в fingerprint\'е браузера!');
    } else {
      console.log('   ℹ️ Одинаковые результаты - проблема в IP или общей защите');
    }
    
    await ffBrowser.close();
    
  } catch (error) {
    console.log(`❌ Ошибка проверки: ${error.message}`);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
};

await checkIPStatus(); 