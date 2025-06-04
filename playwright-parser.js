import { chromium } from 'playwright';

console.log('🛒 ЭФФЕКТИВНЫЙ ПАРСЕР НАЛИЧИЯ: Playwright версия с РАБОЧИМИ ПРОКСИ\n');

// 🌐 Система управления прокси
let botProtectionHits = 0;
let currentProxyIndex = -1; // -1 означает без прокси
let proxyFailures = new Map(); // Счетчик неудач для каждого прокси
let proxyList = []; // Реальные прокси из WebShare API

console.log(`ℹ️ [INFO] 🔧 Инициализируем прокси хендлер...`);

// РЕАЛЬНАЯ загрузка прокси из WebShare API
const fetchProxies = async () => {
  const WEBSHARE_API_KEY = 'qf8q4w-s8r6rk-h6y8yd-6kq5k6-6xb9pkf'; // Ваш ключ из логов
  
  console.log(`🌐 [PROXY] Initializing proxy handler...`);
  console.log(`🌐 [PROXY] Fetching proxies from WebShare.io...`);
  console.log(`🌐 [PROXY] Using WebShare API key: ${WEBSHARE_API_KEY.substring(0, 4)}...${WEBSHARE_API_KEY.slice(-4)}`);
  
  try {
    const response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/', {
      headers: {
        'Authorization': `Token ${WEBSHARE_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`WebShare API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      proxyList = data.results.map(proxy => ({
        host: proxy.proxy_address,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        country: getCountryFlag(proxy.country_code)
      }));
      
      console.log(`🌐 [PROXY] Successfully fetched ${proxyList.length} valid proxies from Webshare.io`);
      console.log(`PROXY FETCH COMPLETED SUCCESSFULLY: Found ${proxyList.length} valid proxies`);
      console.log(`🌐 [PROXY] Successfully initialized proxy handler with ${proxyList.length} proxies`);
      return true;
    } else {
      throw new Error('No proxies returned from WebShare API');
    }
  } catch (error) {
    console.log(`❌ [ERROR] Failed to fetch proxies: ${error.message}`);
    console.log(`🔄 [FALLBACK] Using without proxies...`);
    return false;
  }
};

const getCountryFlag = (countryCode) => {
  const flags = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'JP': '🇯🇵',
    'CA': '🇨🇦', 'AU': '🇦🇺', 'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴'
  };
  return flags[countryCode] || '🌍';
};

const getNextProxy = () => {
  if (proxyList.length === 0) {
    console.log('❌ [ERROR] 🚫 Нет доступных прокси!');
    return null;
  }
  
  console.log('🔍 [DEBUG] Getting next working proxy (random selection)');
  
  // Случайный выбор прокси вместо последовательного
  const availableProxies = proxyList.filter((proxy, index) => {
    const proxyKey = `${proxy.host}:${proxy.port}`;
    const failures = proxyFailures.get(proxyKey) || 0;
    return failures < 3; // Исключаем прокси с 3+ неудачами
  });
  
  if (availableProxies.length === 0) {
    console.log('❌ [ERROR] 🚫 Все прокси исчерпаны!');
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * availableProxies.length);
  const proxy = availableProxies[randomIndex];
  
  console.log(`🌐 [PROXY] 🎲 Randomly selected proxy: ${proxy.country} ${proxy.host}:${proxy.port} with auth ${proxy.username}:*** (${availableProxies.length} available)`);
  console.log(`🌐 [PROXY] ✅ Используем прокси: ${proxy.country} ${proxy.host}:${proxy.port}`);
  
  return proxy;
};

const markProxyFailed = (proxy, reason) => {
  if (!proxy) return;
  
  const proxyKey = `${proxy.host}:${proxy.port}`;
  const failures = (proxyFailures.get(proxyKey) || 0) + 1;
  proxyFailures.set(proxyKey, failures);
  
  console.log(`🌐 [PROXY] Marked proxy ${proxy.country} ${proxy.host}:${proxy.port} as failed (reason: ${reason}, fails: ${failures})`);
  console.log(`🌐 [PROXY] 🔴 Proxy ${proxy.country} ${proxy.host}:${proxy.port} now has total uses: 1 (0 success/${failures} fail) | Rate: 0.0%`);
};

const checkBotProtection = (status) => {
  if (status === 403) {
    botProtectionHits++;
    console.log(`🌐 [PROXY] Bot protection detected. Total hits: ${botProtectionHits}`);
    console.log(`🌐 [PROXY] 🔒 Защита зарегистрирована. Total hits: ${botProtectionHits}, Should use proxy: ${botProtectionHits >= 3}`);
    
    return botProtectionHits >= 3;
  }
  return false;
};

const parseProductAvailability = async () => {
  // Сначала загружаем реальные прокси
  await fetchProxies();
  
  const maxAttempts = 10; // Увеличиваем количество попыток для учета прокси
  let currentProxy = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`ℹ️ [INFO] 🔄 [ATTEMPT ${attempt}/${maxAttempts}] Начинаем попытку...`);
    
    // Если нужно использовать прокси, получаем следующий
    if (botProtectionHits >= 3 && !currentProxy) {
      console.log(`🌐 [PROXY] 🌐 Получаем рабочий прокси...`);
      currentProxy = getNextProxy();
      if (!currentProxy) {
        console.log('❌ [ERROR] ❌ Все прокси исчерпаны. Парсинг не удался.');
        return;
      }
      console.log(`🔍 [DEBUG] 🔧 Настроен прокси: http://${currentProxy.host}:${currentProxy.port}`);
      // Сбрасываем счетчик для нового прокси
      botProtectionHits = 0;
    }
    
    const result = await attemptParsing(attempt, currentProxy);
    
    if (result.success) {
      return;
    }
    
    if (result.needNewProxy) {
      // Помечаем текущий прокси как неработающий
      if (currentProxy) {
        markProxyFailed(currentProxy, 'HTTP_403_MULTIPLE');
      }
      
      // Получаем новый прокси
      console.log(`🌐 [PROXY] 🌐 Получаем рабочий прокси...`);
      currentProxy = getNextProxy();
      if (!currentProxy) {
        console.log('❌ [ERROR] ❌ Все прокси исчерпаны. Парсинг не удался.');
        return;
      }
      console.log(`🔍 [DEBUG] 🔧 Настроен прокси: http://${currentProxy.host}:${currentProxy.port}`);
      // Сбрасываем счетчик для нового прокси
      botProtectionHits = 0;
    }
    
    if (attempt === maxAttempts) {
      console.log('❌ [ERROR] ❌ Все попытки исчерпаны. Парсинг не удался.');
      console.log('ℹ️ [INFO] ┌─────────────── PROXY & REQUEST STATISTICS ───────────────┐');
      console.log('ℹ️ [INFO] │ Timestamp: ' + new Date().toISOString() + '                 │');
      console.log('ℹ️ [INFO] │ Total Requests: 0                                   │');
      console.log(`ℹ️ [INFO] │ Bot Protection Hits: ${botProtectionHits}                               │`);
      console.log('ℹ️ [INFO] │ Proxy Requests: 0                                  │');
      console.log('ℹ️ [INFO] │ Proxy Successes: 0                                 │');
      console.log('ℹ️ [INFO] │ Proxy Failures: 0                                  │');
      console.log('ℹ️ [INFO] │ Proxy Success Rate: N/A                             │');
      console.log(`ℹ️ [INFO] │ Available Proxies: ${proxyList.length}                             │`);
      console.log('ℹ️ [INFO] └──────────────────────────────────────────────────────────┘');
      return;
    }
  }
};

const attemptParsing = async (attempt, proxy = null) => {
  let launchOptions = { 
    headless: true,
    dumpio: true, // 📊 Включаем детальное логирование браузера
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };

  // Если используем прокси, добавляем его в настройки
  if (proxy) {
    launchOptions.proxy = {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password
    };
  }

  const browser = await chromium.launch(launchOptions);
  
  const context = await browser.newContext({
    // 🔧 [USER-AGENT] Реалистичный User-Agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    
    // 🖥️ [VIEWPORT] Реалистичный viewport
    viewport: { width: 1920, height: 1080 },
    
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
  
  // 📊 [ЛОГИРОВАНИЕ] Отслеживание сетевых запросов
  page.on('request', request => {
    console.log(`🔍 [DEBUG] 📤 [OUT-${request.url().slice(-1)}] ${request.method()} ${request.url().substring(0, 80)}...`);
  });
  
  page.on('response', response => {
    console.log(`🔍 [DEBUG] 📥 [IN-${response.url().slice(-1)}] ${response.status()} ${response.url().substring(0, 80)}...`);
  });
  
  // 🎭 [АНТИ-ДЕТЕКЦИЯ] ПОЛНАЯ ПРОФЕССИОНАЛЬНАЯ АНТИ-ДЕТЕКЦИЯ
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
    Object.defineProperty(screen, 'width', { get: () => 1920, configurable: true });
    Object.defineProperty(screen, 'height', { get: () => 1080, configurable: true });
    Object.defineProperty(screen, 'availWidth', { get: () => 1920, configurable: true });
    Object.defineProperty(screen, 'availHeight', { get: () => 1040, configurable: true });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
    
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    delete navigator.__proto__.webdriver;
    
    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU', configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'], configurable: true });
    
    window.navigator.webdriver = false;
    delete window.navigator.webdriver;
    
    if (document.documentElement) {
      document.documentElement.removeAttribute('webdriver');
    }
  });
  
  const productUrl = 'https://www.vseinstrumenti.ru/product/vibratsionnyj-nasos-sibrteh-svn300-15-kabel-15-m-99302-1338303/';
  
  // 🏠 [STAGE 1/3] ГЛАВНАЯ СТРАНИЦА
  console.log('ℹ️ [INFO] 🏠 [STAGE 1/3] Загружаем главную страницу...');
  
  const initialDelay = Math.floor(Math.random() * 5000) + 1000;
  console.log(`🔍 [DEBUG] ⏰ Ожидание ${initialDelay}ms перед запросом...`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));
  
  try {
    const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 5000
    });
    
    const homeStatus = homeResponse.status();
    console.log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`);
    
    if (homeStatus === 403) {
      console.log('⚠️ [WARNING] 🚫 HTTP 403 обнаружен на главной странице');
      const needProxy = checkBotProtection(homeStatus);
      
      if (needProxy) {
        console.log('🔄 [STAGE 1/3] Требуется смена прокси - завершаем попытку...');
        await browser.close();
        return { success: false, needNewProxy: !proxy }; // Нужен прокси если его еще нет
      } else {
        console.log('🔄 [STAGE 1/3] Продолжаем без прокси (попытка в норме)...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.log(`⚠️ [STAGE 1/3] Ошибка загрузки главной: ${error.message}`);
    
    // Если это таймаут, то возможно просто медленное соединение
    if (error.message.includes('Timeout')) {
      console.log('🔄 [STAGE 1/3] Таймаут - продолжаем к следующему этапу...');
    }
  }
  
  // Имитируем просмотр главной
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.mouse.move(500, 300);
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // 🏙️ [STAGE 2/3] УСТАНОВКА ГОРОДА
  console.log('🏙️ [STAGE 2/3] Устанавливаем город...');
  
  let citySuccess = false;
  try {
    const cityUrl = 'https://www.vseinstrumenti.ru/represent/change/?represent_id=1';
    const cityResponse = await page.goto(cityUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 5000
    });
    
    const cityStatus = cityResponse.status();
    console.log(`✅ [STAGE 2/3] Город установлен, статус: ${cityStatus}`);
    
    if (cityStatus === 403) {
      console.log('⚠️ [WARNING] 🚫 HTTP 403 обнаружен на странице города');
      const needProxy = checkBotProtection(cityStatus);
      
      if (needProxy) {
        console.log('🔄 [STAGE 2/3] Требуется смена прокси - завершаем попытку...');
        await browser.close();
        return { success: false, needNewProxy: !proxy }; // Нужен прокси если его еще нет
      }
    }
    
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
      timeout: 5000
    });
    
    const productStatus = productResponse.status();
    console.log(`✅ [STAGE 3/3] Товар загружен, статус: ${productStatus}`);
    
    if (productStatus === 403) {
      console.log('⚠️ [WARNING] 🚫 HTTP 403 обнаружен на странице товара');
      const needProxy = checkBotProtection(productStatus);
      
      if (needProxy) {
        console.log('🔄 [STAGE 3/3] Требуется смена прокси - завершаем попытку...');
        await browser.close();
        return { success: false, needNewProxy: !proxy }; // Нужен прокси если его еще нет
      }
    }
    
    productSuccess = true;
  } catch (productError) {
    console.log(`⚠️ [STAGE 3/3] Ошибка загрузки товара: ${productError.message}`);
    
    // АЛЬТЕРНАТИВНЫЙ ПУТЬ: Прямой переход к товару
    console.log('🎯 [FALLBACK] Пробуем прямой переход к товару без прогрева...');
    
    try {
      const directResponse = await page.goto(productUrl, { 
        waitUntil: 'networkidle',
        timeout: 5000
      });
      
      console.log(`✅ [FALLBACK] Прямой переход успешен, статус: ${directResponse.status()}`);
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
  console.log(`ℹ️ [INFO] 🔧 Браузер закрыт`);
  
  // Если дошли до сюда без ошибок 403, возвращаем успех
  if (availabilityData.availability !== 'unknown') {
    return { success: true, needNewProxy: false };
  }
  
  return { success: false, needNewProxy: false };
};

await parseProductAvailability();

console.log('🏁 Парсинг наличия завершен!'); 