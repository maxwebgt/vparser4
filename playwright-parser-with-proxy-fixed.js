import { chromium } from 'playwright';
import ProxyHandler from './modules/proxyHandler.js';

console.log('🛒 ПАРСЕР НАЛИЧИЯ С ИСПРАВЛЕННОЙ ПОДДЕРЖКОЙ ПРОКСИ\n');

const parseProductAvailability = async (targetUrl = null) => {
  const productUrl = targetUrl || 'https://www.vseinstrumenti.ru/product/vibratsionnyj-nasos-sibrteh-svn300-15-kabel-15-m-99302-1338303/';
  
  console.log(`🎯 Целевой URL: ${productUrl}\n`);
  
  const proxyHandler = new ProxyHandler();
  await proxyHandler.fetchProxies();
  
  const maxAttempts = 10; // Увеличили количество попыток
  let currentProxy = null;
  let usedProxy = false;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 [ПОПЫТКА ${attempt}/${maxAttempts}] Начинаем попытку...`);
    
    // Если есть признаки защиты и нет прокси - получаем прокси
    if (proxyHandler.stats.protectionHits >= 3 && !currentProxy) {
      console.log('🔒 [PROXY] Обнаружена защита - получаем прокси...');
      currentProxy = proxyHandler.getNextProxy();
      if (!currentProxy) {
        console.log('❌ [ERROR] Все прокси исчерпаны');
        break;
      }
      usedProxy = true;
    }
    
    const result = await attemptParsing(attempt, currentProxy, productUrl, proxyHandler);
    
    if (result.success) {
      if (usedProxy && currentProxy) {
        proxyHandler.markProxySuccess(currentProxy);
      }
      console.log('\n✅ ПАРСИНГ УСПЕШНО ЗАВЕРШЕН!');
      return result.data;
    }
    
    if (result.needNewProxy) {
      if (currentProxy) {
        proxyHandler.markProxyFailed(currentProxy, 'HTTP_403');
      }
      
      // Получаем новый прокси
      currentProxy = proxyHandler.getNextProxy();
      if (!currentProxy) {
        console.log('❌ [ERROR] Все прокси исчерпаны');
        break;
      }
      usedProxy = true;
    }
    
    // Увеличенная пауза между попытками
    const delay = attempt * 1000 + Math.random() * 2000; // 1-3 секунды
    console.log(`⏳ Пауза ${Math.round(delay/1000)}с перед следующей попыткой...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  console.log('\n❌ Все попытки исчерпаны');
  proxyHandler.printStats();
  return null;
};

const attemptParsing = async (attempt, proxy, productUrl, proxyHandler) => {
  let browser = null;
  let page = null;
  
  try {
    // Расширенные настройки браузера для маскировки
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--exclude-switch=enable-automation',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-sync'
      ]
    };
    
    // Добавляем прокси если есть
    if (proxy) {
      launchOptions.proxy = {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password
      };
      console.log(`🌐 [PROXY] Используем прокси: ${proxy.country} ${proxy.host}:${proxy.port}`);
    } else {
      console.log('🏠 [DIRECT] Используем прямое подключение');
    }
    
    // Запускаем браузер
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="136", "Google Chrome";v="136"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    page = await context.newPage();
    
    // Устанавливаем таймауты
    page.setDefaultTimeout(45000); // Увеличили таймаут
    
    // Маскируем webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });
    
    // 🚀 [НАВИГАЦИЯ] Улучшенная трехэтапная навигация
    if (productUrl.includes('vseinstrumenti.ru')) {
      console.log('🚀 [NAVIGATION] Используем улучшенную трехэтапную навигацию...');
      
      // Этап 1: Главная страница
      console.log('🏠 [STAGE 1/3] Загружаем главную страницу...');
      try {
        const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        const homeStatus = homeResponse.status();
        console.log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`);
        
        if (homeStatus === 403) {
          console.log('🚫 [PROTECTION] HTTP 403 на главной странице');
          const needProxy = proxyHandler.registerProtectionHit();
          if (needProxy || proxy) {
            return { success: false, needNewProxy: true };
          }
        }
        
        // Ждем немного и проверяем загрузку
        await page.waitForTimeout(2000 + Math.random() * 2000);
        
      } catch (error) {
        console.log(`❌ [STAGE 1/3] Ошибка загрузки главной: ${error.message}`);
        if (error.message.includes('403') || error.message.includes('net::ERR_')) {
          return { success: false, needNewProxy: true };
        }
        return { success: false, needNewProxy: false };
      }
      
      // Этап 2: Установка города
      console.log('🏙️ [STAGE 2/3] Устанавливаем город...');
      try {
        const cityResponse = await page.goto('https://www.vseinstrumenti.ru/represent/change/?represent_id=1', { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        console.log(`✅ [STAGE 2/3] Город установлен, статус: ${cityResponse.status()}`);
        await page.waitForTimeout(1000 + Math.random() * 1000);
        
      } catch (error) {
        console.log(`⚠️ [STAGE 2/3] Ошибка установки города: ${error.message}`);
        // Не критично, продолжаем
      }
      
      // Этап 3: Переход к товару
      await page.waitForTimeout(1000 + Math.random() * 1000);
      console.log('🛒 [STAGE 3/3] Переходим к товару...');
    }
    
    // Переходим к товару
    try {
      const productResponse = await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      
      const productStatus = productResponse.status();
      console.log(`✅ [PRODUCT] Товар загружен, статус: ${productStatus}`);
      
      if (productStatus === 403) {
        console.log('🚫 [PROTECTION] HTTP 403 на странице товара');
        const needProxy = proxyHandler.registerProtectionHit();
        if (needProxy || proxy) {
          return { success: false, needNewProxy: true };
        }
      }
      
      if (productStatus === 404) {
        console.log('📭 [INFO] HTTP 404 - товар не найден');
        // 404 не является ошибкой защиты, но парсинг невозможен
        return { success: false, needNewProxy: false };
      }
      
    } catch (error) {
      console.log(`❌ [PRODUCT] Ошибка загрузки товара: ${error.message}`);
      if (error.message.includes('403') || error.message.includes('net::ERR_')) {
        return { success: false, needNewProxy: true };
      }
      return { success: false, needNewProxy: false };
    }
    
    // Ждем загрузку контента
    await page.waitForTimeout(3000 + Math.random() * 2000);
    
    // 🔍 [PARSING] Парсим наличие
    console.log('\n🔍 ПАРСИНГ НАЛИЧИЯ...');
    
    const availabilityData = await page.evaluate(() => {
      const data = {};
      
      // 1. Ищем кнопку "В корзину"
      let addToCartBtn = document.querySelector('[data-qa="product-add-to-cart-button"]') ||
                         document.querySelector('button[title="В корзину"]') ||
                         document.querySelector('.add-to-cart') ||
                         document.querySelector('.OnnEZB button');
      
      if (!addToCartBtn) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          const btnText = btn.textContent.toLowerCase().trim();
          if (btnText.includes('в корзину') || btnText.includes('купить')) {
            addToCartBtn = btn;
            break;
          }
        }
      }
      
      data.addToCartBtnFound = !!addToCartBtn;
      
      if (addToCartBtn) {
        data.btnDisabled = addToCartBtn.disabled;
        data.btnHasDisabledClass = addToCartBtn.classList.contains('disabled');
        data.btnText = addToCartBtn.textContent.trim();
        
        if (!addToCartBtn.disabled && !addToCartBtn.classList.contains('disabled')) {
          data.availability = 'in_stock';
          data.quantity = 1; // По умолчанию
        } else {
          data.availability = 'out_of_stock';
          data.quantity = 0;
        }
      } else {
        data.availability = 'unknown';
        data.quantity = 0;
      }
      
      // Дополнительная информация для отладки
      data.title = document.title;
      data.hasContent = document.body.innerHTML.length > 1000;
      
      return data;
    });
    
    // Выводим результат
    console.log('\n📦 === РЕЗУЛЬТАТ ПАРСИНГА ===');
    console.log(`🎯 СТАТУС: ${availabilityData.availability}`);
    console.log(`📊 КОЛИЧЕСТВО: ${availabilityData.quantity} шт`);
    console.log(`📄 ЗАГОЛОВОК: ${availabilityData.title?.substring(0, 50)}...`);
    console.log('\n🔧 ОТЛАДОЧНАЯ ИНФОРМАЦИЯ:');
    console.log(`   Кнопка "В корзину" найдена: ${availabilityData.addToCartBtnFound ? '✅' : '❌'}`);
    console.log(`   Контент загружен: ${availabilityData.hasContent ? '✅' : '❌'}`);
    if (availabilityData.addToCartBtnFound) {
      console.log(`   Текст кнопки: "${availabilityData.btnText}"`);
      console.log(`   Кнопка отключена: ${availabilityData.btnDisabled ? '❌' : '✅'}`);
    }
    console.log('=======================================');
    
    await browser.close();
    
    return {
      success: true,
      needNewProxy: false,
      data: availabilityData
    };
    
  } catch (error) {
    console.log(`❌ [ERROR] Ошибка парсинга: ${error.message}`);
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    
    // Анализируем тип ошибки
    if (error.message.includes('403') || 
        error.message.includes('net::ERR_PROXY') ||
        error.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED')) {
      return { success: false, needNewProxy: true };
    }
    
    return { success: false, needNewProxy: false };
  }
};

const main = async () => {
  try {
    const result = await parseProductAvailability();
    
    if (result) {
      console.log('\n🎉 ПАРСИНГ ЗАВЕРШЕН УСПЕШНО!');
    } else {
      console.log('\n❌ ПАРСИНГ НЕ УДАЛСЯ');
    }
  } catch (error) {
    console.log(`❌ Критическая ошибка: ${error.message}`);
  }
};

// Запуск
await main(); 