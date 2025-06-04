import { chromium } from 'playwright';

console.log('🛒 ЭФФЕКТИВНЫЙ ПАРСЕР НАЛИЧИЯ: Playwright версия\n');

const parseProductAvailability = async () => {
  const browser = await chromium.launch({ 
    headless: true,
    slowMo: 100, // Замедляем для VDS
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
  });
  
  // Рандомизируем User-Agent для VDS
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  const context = await browser.newContext({
    // 🔧 [USER-AGENT] Рандомный реалистичный User-Agent
    userAgent: randomUA,
    
    // 🖥️ [VIEWPORT] Рандомный реалистичный viewport
    viewport: { 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 100) 
    },
    
    // 🌐 [LOCALE] Локализация
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    
    // 📋 [HEADERS] Критически важные заголовки
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
  
  // 🔧 [NETWORK LOGGING] Перехватываем все сетевые запросы для диагностики
  page.on('request', request => {
    console.log('🌐 [REQUEST]', request.method(), request.url(), 'Headers:', JSON.stringify(request.headers(), null, 2));
  });
  
  page.on('response', response => {
    console.log('📡 [RESPONSE]', response.status(), response.url(), 'Headers:', JSON.stringify(response.headers(), null, 2));
  });
  
  page.on('requestfailed', request => {
    console.log('❌ [REQUEST FAILED]', request.url(), request.failure().errorText);
  });
  
  // 🎭 [АНТИ-ДЕТЕКЦИЯ] МАКСИМАЛЬНО АГРЕССИВНАЯ АНТИ-ДЕТЕКЦИЯ ДЛЯ VDS
  await page.addInitScript(() => {
    // Удаляем все признаки webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    delete navigator.__proto__.webdriver;
    delete navigator.webdriver;
    delete window.navigator.webdriver;
    
    // Переопределяем платформу и экран
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
    Object.defineProperty(screen, 'width', { get: () => 1920, configurable: true });
    Object.defineProperty(screen, 'height', { get: () => 1080, configurable: true });
    Object.defineProperty(screen, 'availWidth', { get: () => 1920, configurable: true });
    Object.defineProperty(screen, 'availHeight', { get: () => 1040, configurable: true });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
    
    // Язык и локаль
    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU', configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'], configurable: true });
    
    // Удаляем selenium признаки
    delete window.document.$cdc_asdjflasutopfhvcZLmcfl_;
    delete window.$chrome_asyncScriptInfo;
    delete window.__$webdriverAsyncExecutor;
    delete window.__webdriver_script_fn;
    delete window.__selenium_unwrapped;
    delete window.__webdriver_unwrapped;
    
    // Переопределяем plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { 0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", filename: "internal-pdf-viewer" } },
        { 1: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" } }
      ]
    });
    
    // Маскируем chrome runtime
    if (window.chrome) {
      Object.defineProperty(window.chrome, 'runtime', {
        get: () => ({ onConnect: undefined, onMessage: undefined })
      });
    }
    
    // Удаляем webdriver атрибут из DOM
    const originalQuery = document.querySelector;
    document.querySelector = function(selector) {
      if (selector === '[webdriver]') return null;
      return originalQuery.call(document, selector);
    };
    
    if (document.documentElement) {
      document.documentElement.removeAttribute('webdriver');
    }
    
    // Переопределяем permission API
    const originalQuery2 = navigator.permissions.query;
    navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery2(parameters)
    );
  });
  
  const productUrl = 'https://www.vseinstrumenti.ru/product/vibratsionnyj-nasos-sibrteh-svn300-15-kabel-15-m-99302-1338303/';
  
  // 🏠 [STAGE 1/3] ГЛАВНАЯ СТРАНИЦА
  console.log('🏠 [STAGE 1/3] Загружаем главную страницу...');
  console.log('🔧 [DEBUG] User-Agent:', await page.evaluate(() => navigator.userAgent));
  console.log('🔧 [DEBUG] Viewport:', await page.viewportSize());
  
  // Большая случайная задержка для VDS
  const initialDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 секунд
  console.log(`🔧 [DEBUG] Waiting ${initialDelay}ms before first request...`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));
  
  try {
    const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    const homeStatus = homeResponse.status();
    console.log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`);
    console.log('🔧 [DEBUG] Response headers:', homeResponse.headers());
    
    // Логируем содержимое страницы
    const pageTitle = await page.title();
    console.log('🔧 [DEBUG] Page title:', pageTitle);
    
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 200) : 'BODY НЕ НАЙДЕН');
    console.log('🔧 [DEBUG] Body preview:', bodyText);
    
    // КРИТИЧЕСКИ ВАЖНО: логируем HTML содержимое
    const htmlContent = await page.content();
    console.log('🔧 [DEBUG] HTML content length:', htmlContent.length);
    console.log('🔧 [DEBUG] HTML preview:', htmlContent.substring(0, 500));
    
    // Проверяем есть ли капча или блокировка
    const hasCloudflare = htmlContent.includes('cloudflare') || htmlContent.includes('Cloudflare');
    const hasBlock = htmlContent.includes('блокирован') || htmlContent.includes('заблокирован') || htmlContent.includes('blocked');
    const hasCaptcha = htmlContent.includes('captcha') || htmlContent.includes('Captcha');
    console.log('🔧 [DEBUG] Security check:', { hasCloudflare, hasBlock, hasCaptcha });
    
          if (homeStatus === 403) {
        console.log('🔄 [STAGE 1/3] HTTP 403 - начинается прогрев прокси...');
        const retryDelay = Math.floor(Math.random() * 5000) + 5000; // 5-10 секунд
        console.log(`🔧 [DEBUG] Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      try {
        const homeRetryResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        
        console.log(`✅ [STAGE 1/3] Прогрев завершен, статус: ${homeRetryResponse.status()}`);
        console.log('🔧 [DEBUG] Retry headers:', homeRetryResponse.headers());
      } catch (retryError) {
        console.log(`⚠️ [STAGE 1/3] Ошибка повторного запроса: ${retryError.message}`);
        console.log('🔄 [STAGE 1/3] Продолжаем работу несмотря на ошибку...');
      }
    }
  } catch (error) {
    console.log(`⚠️ [STAGE 1/3] Ошибка загрузки главной: ${error.message}`);
  }
  
  // Имитируем РЕАЛЬНОГО человека на главной странице
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Случайные движения мыши
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(Math.random() * 1000) + 100;
    const y = Math.floor(Math.random() * 500) + 100;
    await page.mouse.move(x, y);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  }
  
  // Скроллинг как человек
  await page.mouse.wheel(0, Math.floor(Math.random() * 500) + 200);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.mouse.wheel(0, -Math.floor(Math.random() * 300) + 100);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 🏙️ [STAGE 2/3] УСТАНОВКА ГОРОДА
  console.log('🏙️ [STAGE 2/3] Устанавливаем город...');
  
  let citySuccess = false;
  try {
    const cityUrl = 'https://www.vseinstrumenti.ru/represent/change/?represent_id=1';
    const cityResponse = await page.goto(cityUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    console.log(`✅ [STAGE 2/3] Город установлен, статус: ${cityResponse.status()}`);
    console.log('🔧 [DEBUG] City headers:', cityResponse.headers());
    citySuccess = true;
  } catch (cityError) {
    console.log(`⚠️ [STAGE 2/3] Ошибка установки города: ${cityError.message}`);
    console.log('🔄 [STAGE 2/3] Пропускаем установку города и идем к товару...');
  }
  
  if (citySuccess) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 🛒 [STAGE 3/3] ПЕРЕХОД НА ТОВАР
  console.log('🛒 [STAGE 3/3] Переходим к товару...');
  
  let productSuccess = false;
  try {
    const productResponse = await page.goto(productUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    console.log(`✅ [STAGE 3/3] Товар загружен, статус: ${productResponse.status()}`);
    console.log('🔧 [DEBUG] Product headers:', productResponse.headers());
    
    // Логируем содержимое страницы товара
    const productTitle = await page.title();
    console.log('🔧 [DEBUG] Product page title:', productTitle);
    
    const productBody = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : 'BODY НЕ НАЙДЕН');
    console.log('🔧 [DEBUG] Product body preview:', productBody);
    
    // КРИТИЧЕСКИ ВАЖНО: логируем HTML содержимое товара
    const productHtml = await page.content();
    console.log('🔧 [DEBUG] Product HTML content length:', productHtml.length);
    console.log('🔧 [DEBUG] Product HTML preview:', productHtml.substring(0, 500));
    
    // Проверяем блокировку на странице товара
    const productHasCloudflare = productHtml.includes('cloudflare') || productHtml.includes('Cloudflare');
    const productHasBlock = productHtml.includes('блокирован') || productHtml.includes('заблокирован') || productHtml.includes('blocked');
    const productHasCaptcha = productHtml.includes('captcha') || productHtml.includes('Captcha');
    console.log('🔧 [DEBUG] Product security check:', { productHasCloudflare, productHasBlock, productHasCaptcha });
    
    productSuccess = true;
  } catch (productError) {
    console.log(`⚠️ [STAGE 3/3] Ошибка загрузки товара: ${productError.message}`);
    
    // АЛЬТЕРНАТИВНЫЙ ПУТЬ: Прямой переход к товару
    console.log('🎯 [FALLBACK] Пробуем прямой переход к товару без прогрева...');
    
    try {
      const directResponse = await page.goto(productUrl, { 
        waitUntil: 'networkidle',
        timeout: 10000
      });
      
      console.log(`✅ [FALLBACK] Прямой переход успешен, статус: ${directResponse.status()}`);
      console.log('🔧 [DEBUG] Direct headers:', directResponse.headers());
      
      // Логируем содержимое после прямого перехода
      const directTitle = await page.title();
      console.log('🔧 [DEBUG] Direct page title:', directTitle);
      
      const directBody = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : 'BODY НЕ НАЙДЕН');
      console.log('🔧 [DEBUG] Direct body preview:', directBody);
      
      productSuccess = true;
    } catch (directError) {
      console.log(`❌ [FALLBACK] Прямой переход тоже не работает: ${directError.message}`);
      console.log('🔄 [FALLBACK] Продолжаем парсинг с текущей страницы...');
    }
  }
  
  // ПАРСИНГ НАЛИЧИЯ
  console.log('\n🔍 ПАРСИНГ НАЛИЧИЯ...\n');
  
  // Минимальное ожидание для загрузки контента
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Диагностика текущей страницы
  const currentUrl = page.url();
  const currentTitle = await page.title();
  console.log('🔧 [DEBUG] Current URL:', currentUrl);
  console.log('🔧 [DEBUG] Current title:', currentTitle);
  
  // Проверяем есть ли хоть какой-то контент
  const hasContent = await page.evaluate(() => {
    return {
      bodyExists: !!document.body,
      bodyLength: document.body ? document.body.innerText.length : 0,
      hasButtons: document.querySelectorAll('button').length,
      hasLinks: document.querySelectorAll('a').length,
      hasText: document.body ? document.body.innerText.substring(0, 100) : 'НЕТ BODY'
    };
  });
  console.log('🔧 [DEBUG] Content check:', hasContent);
  
  // Делаем скриншот для отладки (если нужно)
  try {
    await page.screenshot({ path: '/tmp/debug-page.png', fullPage: false });
    console.log('🔧 [DEBUG] Screenshot saved to /tmp/debug-page.png');
  } catch (screenshotError) {
    console.log('🔧 [DEBUG] Screenshot failed:', screenshotError.message);
  }
  
  const availabilityData = await page.evaluate(() => {
    const data = {};
    
    // 1. ИЩЕМ КНОПКУ "В КОРЗИНУ"
    let addToCartBtn = document.querySelector('[data-qa="product-add-to-cart-button"]') ||
                       document.querySelector('button[title="В корзину"]') ||
                       document.querySelector('.add-to-cart') ||
                       document.querySelector('.OnnEZB button') ||
                       document.querySelector('[class*="add-to-cart"]') ||
                       document.querySelector('[class*="buy-button"]') ||
                       document.querySelector('button[data-qa*="add-to-cart"]') ||
                       document.querySelector('button[data-qa*="buy"]');
    
    // Если не нашли специфичные селекторы, ищем по тексту кнопки
    if (!addToCartBtn) {
      const allButtons = document.querySelectorAll('button');
      for (const btn of allButtons) {
        const btnText = btn.textContent.toLowerCase().trim();
        if (btnText.includes('в корзину') || 
            btnText.includes('купить') || 
            btnText.includes('заказать') ||
            btnText.includes('добавить')) {
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
        
        // 2. ИЩЕМ ТОЧНОЕ КОЛИЧЕСТВО
        const availabilityEl = document.querySelector('[data-qa="availability-info"]');
        if (availabilityEl) {
          const quantityText = availabilityEl.textContent;
          data.availabilityText = quantityText;
          
          // Точное число: "351 шт"
          let exactMatch = quantityText.match(/(\d+)\s*шт/);
          if (exactMatch) {
            data.quantity = parseInt(exactMatch[1]);
          } else {
            // Больше числа: "> 100 шт", "более 100 шт"
            let moreMatch = quantityText.match(/[>больше|более]\s*(\d+)\s*шт/i);
            if (moreMatch) {
              data.quantity = parseInt(moreMatch[1]);
            } else {
              data.quantity = 1; // Минимальное количество
            }
          }
        } else {
          data.quantity = 1; // По умолчанию
        }
        
        // 3. ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ О ДОСТАВКЕ
        const deliveryInfos = [];
        
        // Самовывоз
        const pickupElement = document.querySelector('[data-qa="product-availability"]');
        if (pickupElement) {
          const pickupText = pickupElement.innerText.trim();
          const pickupMatch = pickupText.match(/Самовывоз:(.+)/);
          if (pickupMatch) {
            deliveryInfos.push(`Самовывоз: ${pickupMatch[1].trim()}`);
          }
        }
        
        // Курьерская доставка
        const deliveryLinkElement = document.querySelector('[data-qa="courier-delivery-modal"]');
        if (deliveryLinkElement) {
          let deliveryText = deliveryLinkElement.parentElement.innerText.trim();
          deliveryText = deliveryText.replace(/^Курьером:\s*/, '');
          deliveryInfos.push(`Курьером: ${deliveryText}`);
        }
        
        data.deliveryInfo = deliveryInfos;
        
      } else {
        data.availability = 'out_of_stock';
        data.quantity = 0;
      }
    } else {
      data.availability = 'unknown';
      data.quantity = 0;
    }
    
    return data;
  });
  
  // РЕЗУЛЬТАТЫ
  console.log('📦 === РЕЗУЛЬТАТ ПАРСИНГА НАЛИЧИЯ ===');
  console.log(`🎯 СТАТУС: ${availabilityData.availability}`);
  console.log(`📊 КОЛИЧЕСТВО: ${availabilityData.quantity} шт`);
  
  if (availabilityData.availabilityText) {
    console.log(`💬 ТЕКСТ НАЛИЧИЯ: "${availabilityData.availabilityText}"`);
  }
  
  if (availabilityData.deliveryInfo && availabilityData.deliveryInfo.length > 0) {
    console.log('🚚 ДОСТАВКА:');
    availabilityData.deliveryInfo.forEach(info => console.log(`   ${info}`));
  }
  
  console.log('\n🔧 ОТЛАДОЧНАЯ ИНФОРМАЦИЯ:');
  console.log(`   Кнопка "В корзину" найдена: ${availabilityData.addToCartBtnFound ? '✅' : '❌'}`);
  if (availabilityData.addToCartBtnFound) {
    console.log(`   Кнопка отключена: ${availabilityData.btnDisabled ? '❌' : '✅'}`);
    console.log(`   Есть класс disabled: ${availabilityData.btnHasDisabledClass ? '❌' : '✅'}`);
    console.log(`   Текст кнопки: "${availabilityData.btnText}"`);
  }
  
  console.log('=======================================\n');
  
  await browser.close();
};

await parseProductAvailability();

console.log('🏁 Парсинг наличия завершен!'); 