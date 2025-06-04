import { chromium } from 'playwright';

console.log('🛒 ЭФФЕКТИВНЫЙ ПАРСЕР НАЛИЧИЯ: Playwright версия\n');

const parseProductAvailability = async () => {
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  
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
  console.log('🏠 [STAGE 1/3] Загружаем главную страницу...');
  
  const initialDelay = Math.floor(Math.random() * 1000) + 500;
  await new Promise(resolve => setTimeout(resolve, initialDelay));
  
  try {
    const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 5000
    });
    
    const homeStatus = homeResponse.status();
    console.log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`);
    
    if (homeStatus === 403) {
      console.log('🔄 [STAGE 1/3] HTTP 403 - начинается прогрев прокси...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        const homeRetryResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
          waitUntil: 'domcontentloaded',
          timeout: 5000
        });
        
        console.log(`✅ [STAGE 1/3] Прогрев завершен, статус: ${homeRetryResponse.status()}`);
      } catch (retryError) {
        console.log(`⚠️ [STAGE 1/3] Ошибка повторного запроса: ${retryError.message}`);
        console.log('🔄 [STAGE 1/3] Продолжаем работу несмотря на ошибку...');
      }
    }
  } catch (error) {
    console.log(`⚠️ [STAGE 1/3] Ошибка загрузки главной: ${error.message}`);
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
    
    console.log(`✅ [STAGE 2/3] Город установлен, статус: ${cityResponse.status()}`);
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
    
    console.log(`✅ [STAGE 3/3] Товар загружен, статус: ${productResponse.status()}`);
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
};

await parseProductAvailability();

console.log('🏁 Парсинг наличия завершен!'); 