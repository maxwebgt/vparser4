import { chromium } from 'playwright';
import { getProxyHandler, getCountryEmoji } from './modules/proxyHandler.js';
import { PROXY_CONFIG } from './modules/config.js';
import { log } from './modules/logger.js';

console.log('🛒 ЭФФЕКТИВНЫЙ ПАРСЕР НАЛИЧИЯ: Playwright версия с РАБОЧИМИ ПРОКСИ\n');

const parseProductAvailability = async () => {
  let browser = null;
  let currentProxy = null;
  let proxyHandler = null;
  let usedProxy = false;
  
  try {
    // Инициализируем прокси хендлер
    log('🔧 Инициализируем прокси хендлер...', 'info');
    proxyHandler = await getProxyHandler();
    
    // Определяем нужен ли прокси сразу или после первых ошибок
    let shouldUseProxy = false;
    
    // Пробуем без прокси первые несколько попыток
    const MAX_ATTEMPTS = 3;
    let success = false;
    
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !success; attempt++) {
      log(`🔄 [ATTEMPT ${attempt}/${MAX_ATTEMPTS}] Начинаем попытку...`, 'info');
      
      // Закрываем предыдущий браузер если есть
      if (browser) {
        await browser.close();
        browser = null;
      }
      
      // Если нужен прокси, получаем новый
      if (shouldUseProxy || (attempt > 2 && !success)) {
        log('🌐 Получаем рабочий прокси...', 'proxy');
        currentProxy = await proxyHandler.getNextWorkingProxy();
        
        if (currentProxy) {
          usedProxy = true;
          log(`✅ Используем прокси: ${getCountryEmoji(currentProxy.country)} ${currentProxy.host}:${currentProxy.port}`, 'proxy');
        } else {
          log('⚠️ Не удалось получить рабочий прокси, продолжаем без него', 'warning');
        }
      }
      
      // Создаем браузер
      const launchOptions = { 
        headless: true,
        slowMo: 100,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-ipc-flooding-protection',
          '--disable-blink-features=AutomationControlled'
        ]
      };
      
      // Добавляем прокси если есть
      if (currentProxy) {
        launchOptions.proxy = {
          server: `http://${currentProxy.host}:${currentProxy.port}`,
          username: currentProxy.username,
          password: currentProxy.password
        };
        log(`🔧 Настроен прокси: http://${currentProxy.host}:${currentProxy.port}`, 'debug');
      }
      
      browser = await chromium.launch(launchOptions);
      
      // Рандомизируем User-Agent
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      ];
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
      
      const context = await browser.newContext({
        userAgent: randomUA,
        viewport: { 
          width: 1920 + Math.floor(Math.random() * 100), 
          height: 1080 + Math.floor(Math.random() * 100) 
        },
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="136", "Not_A Brand";v="24", "Google Chrome";v="136"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'DNT': '1'
        }
      });
      
      const page = await context.newPage();
      
      // Сетевое логирование
      let requestCount = 0;
      let responseCount = 0;
      
      page.on('request', request => {
        requestCount++;
        if (request.url().includes('vseinstrumenti.ru')) {
          log(`📤 [OUT-${requestCount}] ${request.method()} ${request.url().substring(0, 80)}...`, 'debug');
        }
      });
      
      page.on('response', response => {
        responseCount++;
        if (response.url().includes('vseinstrumenti.ru')) {
          log(`📥 [IN-${responseCount}] ${response.status()} ${response.url().substring(0, 80)}...`, 'debug');
        }
      });
      
      page.on('requestfailed', request => {
        log(`❌ [FAILED] ${request.url().substring(0, 80)}... - ${request.failure().errorText}`, 'error');
      });
      
      // Анти-детекция
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
        delete navigator.__proto__.webdriver;
        delete navigator.webdriver;
        delete window.navigator.webdriver;
        
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
        Object.defineProperty(screen, 'width', { get: () => 1920, configurable: true });
        Object.defineProperty(screen, 'height', { get: () => 1080, configurable: true });
        Object.defineProperty(screen, 'availWidth', { get: () => 1920, configurable: true });
        Object.defineProperty(screen, 'availHeight', { get: () => 1040, configurable: true });
        Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
        Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
        
        Object.defineProperty(navigator, 'language', { get: () => 'ru-RU', configurable: true });
        Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'], configurable: true });
        
        delete window.document.$cdc_asdjflasutopfhvcZLmcfl_;
        delete window.$chrome_asyncScriptInfo;
        delete window.__$webdriverAsyncExecutor;
        delete window.__webdriver_script_fn;
        delete window.__selenium_unwrapped;
        delete window.__webdriver_unwrapped;
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            { 0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", filename: "internal-pdf-viewer" } },
            { 1: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" } }
          ]
        });
        
        if (window.chrome) {
          Object.defineProperty(window.chrome, 'runtime', {
            get: () => ({ onConnect: undefined, onMessage: undefined })
          });
        }
        
        const originalQuery = document.querySelector;
        document.querySelector = function(selector) {
          if (selector === '[webdriver]') return null;
          return originalQuery.call(document, selector);
        };
        
        if (document.documentElement) {
          document.documentElement.removeAttribute('webdriver');
        }
        
        const originalQuery2 = navigator.permissions.query;
        navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery2(parameters)
        );
      });
      
      try {
        const productUrl = 'https://www.vseinstrumenti.ru/product/vibratsionnyj-nasos-sibrteh-svn300-15-kabel-15-m-99302-1338303/';
        
        // 🏠 [STAGE 1/3] ГЛАВНАЯ СТРАНИЦА
        log('🏠 [STAGE 1/3] Загружаем главную страницу...', 'info');
        
        const initialDelay = Math.floor(Math.random() * 3000) + 2000;
        log(`⏰ Ожидание ${initialDelay}ms перед запросом...`, 'debug');
        await new Promise(resolve => setTimeout(resolve, initialDelay));
        
        const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        const homeStatus = homeResponse.status();
        log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`, 'info');
        
        if (homeStatus === 403) {
          log('🚫 HTTP 403 обнаружен на главной странице', 'warning');
          
          // Регистрируем защиту
          const needsProxy = proxyHandler.registerProtectionHit();
          log(`🔒 Защита зарегистрирована. Total hits: ${proxyHandler.getProtectionHitCount()}, Should use proxy: ${needsProxy}`, 'proxy');
          
          if (currentProxy) {
            // Помечаем текущий прокси как неудачный
            proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_HOME_PAGE');
            currentProxy = null;
            usedProxy = false;
          }
          
          shouldUseProxy = true;
          continue; // Переходим к следующей попытке
        }
        
        // Логируем содержимое страницы
        const pageTitle = await page.title();
        log(`📄 Page title: "${pageTitle}"`, 'debug');
        
        const htmlContent = await page.content();
        log(`📊 HTML content length: ${htmlContent.length}`, 'debug');
        
        // Проверяем есть ли защита
        const hasCloudflare = htmlContent.includes('cloudflare') || htmlContent.includes('Cloudflare');
        const hasBlock = htmlContent.includes('блокирован') || htmlContent.includes('заблокирован') || htmlContent.includes('blocked');
        const hasCaptcha = htmlContent.includes('captcha') || htmlContent.includes('Captcha');
        log(`🔍 Security check: cloudflare=${hasCloudflare}, block=${hasBlock}, captcha=${hasCaptcha}`, 'debug');
        
        if (hasCloudflare || hasBlock || hasCaptcha) {
          log('🚫 Обнаружена система защиты в HTML', 'warning');
          
          const needsProxy = proxyHandler.registerProtectionHit();
          log(`🔒 Защита зарегистрирована. Should use proxy: ${needsProxy}`, 'proxy');
          
          if (currentProxy) {
            proxyHandler.markProxyAsFailed(currentProxy, 'PROTECTION_DETECTED');
            currentProxy = null;
            usedProxy = false;
          }
          
          shouldUseProxy = true;
          continue;
        }
        
        // Имитируем человеческое поведение
        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.mouse.move(500, 300);
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // 🏙️ [STAGE 2/3] УСТАНОВКА ГОРОДА
        log('🏙️ [STAGE 2/3] Устанавливаем город...', 'info');
        
        const cityUrl = 'https://www.vseinstrumenti.ru/represent/change/?represent_id=1';
        const cityResponse = await page.goto(cityUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        const cityStatus = cityResponse.status();
        log(`✅ [STAGE 2/3] Город установлен, статус: ${cityStatus}`, 'info');
        
        if (cityStatus === 403) {
          log('🚫 HTTP 403 на этапе города', 'warning');
          
          const needsProxy = proxyHandler.registerProtectionHit();
          
          if (currentProxy) {
            proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_CITY_PAGE');
            currentProxy = null;
            usedProxy = false;
          }
          
          shouldUseProxy = true;
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 🛒 [STAGE 3/3] ПЕРЕХОД НА ТОВАР
        log('🛒 [STAGE 3/3] Переходим на товар...', 'info');
        
        const productResponse = await page.goto(productUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        const productStatus = productResponse.status();
        log(`✅ [STAGE 3/3] Товар загружен, статус: ${productStatus}`, 'info');
        
        if (productStatus === 403) {
          log('🚫 HTTP 403 на странице товара', 'warning');
          
          const needsProxy = proxyHandler.registerProtectionHit();
          
          if (currentProxy) {
            proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_PRODUCT_PAGE');
            currentProxy = null;
            usedProxy = false;
          }
          
          shouldUseProxy = true;
          continue;
        }
        
        // Ждем загрузки контента
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 🔍 [EXTRACTION] ИЗВЛЕЧЕНИЕ ДАННЫХ
        log('🔍 [EXTRACTION] Извлекаем данные товара...', 'info');
        
        const productData = await page.evaluate(() => {
          const data = {};
          
          // Название товара
          const titleElement = document.querySelector('h1[data-qa="get-product-title"]') ||
                              document.querySelector('h1.product__title') ||
                              document.querySelector('h1');
          
          if (titleElement) {
            data.name = titleElement.textContent.trim();
          }
          
          // Цена
          const priceElement = document.querySelector('[data-qa="price-now"]') ||
                              document.querySelector('[data-behavior="price-now"]') ||
                              document.querySelector('.N2sK2A [data-qa="price-now"]');
          
          if (priceElement) {
            const priceText = priceElement.textContent.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
            const priceMatch = priceText.match(/\d[\d\s\u00A0]*\d|\d+/);
            if (priceMatch) {
              const cleanedPrice = priceMatch[0].replace(/[\s\u00A0]+/g, '').replace(',', '.');
              const price = parseFloat(cleanedPrice);
              if (!isNaN(price) && price > 0) {
                data.price = price;
              }
            }
          }
          
          // Наличие
          const addToCartBtn = document.querySelector('[data-qa="product-add-to-cart-button"]') ||
                              document.querySelector('button[title="В корзину"]') ||
                              document.querySelector('.add-to-cart');
          
          const totalButtons = document.querySelectorAll('button').length;
          data.totalButtons = totalButtons;
          data.hasAddToCartBtn = !!addToCartBtn;
          
          if (addToCartBtn && !addToCartBtn.disabled && !addToCartBtn.classList.contains('disabled')) {
            data.availability = 'in_stock';
            
            // Количество
            const availabilityEl = document.querySelector('[data-qa="availability-info"]');
            if (availabilityEl) {
              const quantityText = availabilityEl.textContent;
              const exactMatch = quantityText.match(/(\d+)\s*шт/);
              if (exactMatch) {
                data.quantity = parseInt(exactMatch[1]);
              } else {
                const moreMatch = quantityText.match(/[>больше|более]\s*(\d+)\s*шт/i);
                if (moreMatch) {
                  data.quantity = parseInt(moreMatch[1]);
                } else {
                  data.quantity = 1;
                }
              }
            } else {
              data.quantity = 1;
            }
          } else {
            data.availability = 'out_of_stock';
            data.quantity = 0;
          }
          
          return data;
        });
        
        log(`📊 [EXTRACTION] Данные извлечены:`, 'success');
        log(`   • Название: ${productData.name || 'НЕ НАЙДЕНО'}`, 'info');
        log(`   • Цена: ${productData.price || 'НЕ НАЙДЕНА'} руб.`, 'info');
        log(`   • Наличие: ${productData.availability || 'НЕ ОПРЕДЕЛЕНО'}`, 'info');
        log(`   • Количество: ${productData.quantity || 0} шт.`, 'info');
        log(`   • Кнопок на странице: ${productData.totalButtons || 0}`, 'debug');
        log(`   • Кнопка "В корзину": ${productData.hasAddToCartBtn ? 'НАЙДЕНА' : 'НЕ НАЙДЕНА'}`, 'debug');
        
        // Если данные успешно извлечены
        if (productData.name && productData.name.length > 10) {
          success = true;
          
          // Регистрируем успех
          if (usedProxy) {
            proxyHandler.registerSuccess(true, currentProxy);
            log(`✅ Успешное извлечение с прокси ${currentProxy.host}:${currentProxy.port}`, 'proxy');
          } else {
            proxyHandler.registerSuccess(false);
            log(`✅ Успешное извлечение без прокси`, 'success');
          }
          
          break; // Выходим из цикла попыток
        } else {
          log('⚠️ Данные не извлечены или неполные', 'warning');
          
          if (currentProxy) {
            proxyHandler.markProxyAsFailed(currentProxy, 'NO_DATA_EXTRACTED');
            currentProxy = null;
            usedProxy = false;
          }
          
          shouldUseProxy = true;
        }
        
      } catch (error) {
        log(`❌ [ATTEMPT ${attempt}] Ошибка: ${error.message}`, 'error');
        
        if (currentProxy) {
          proxyHandler.markProxyAsFailed(currentProxy, `ERROR_${error.message.substring(0, 50)}`);
          currentProxy = null;
          usedProxy = false;
        }
        
        shouldUseProxy = true;
      }
    }
    
    if (!success) {
      log('❌ Все попытки исчерпаны. Парсинг не удался.', 'error');
    }
    
    // Печатаем финальную статистику
    if (proxyHandler) {
      proxyHandler.printStats();
    }
    
  } catch (error) {
    log(`💥 Критическая ошибка: ${error.message}`, 'error');
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      log('🔧 Браузер закрыт', 'info');
    }
  }
};

// Запускаем парсер
parseProductAvailability(); 