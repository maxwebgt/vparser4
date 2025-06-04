import { chromium } from 'playwright';
import ProxyHandler from './modules/proxyHandler.js';
import fs from 'fs';
import path from 'path';

console.log('🔍 ОТЛАДОЧНЫЙ ПАРСЕР С ДЕТАЛЬНЫМ ЛОГИРОВАНИЕМ\n');

// Создаем папку для отладки
const debugDir = 'debug';
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir);
}

const debugParsing = async (targetUrl = null) => {
  // Попробуем несколько URL для тестирования
  const testUrls = [
    targetUrl || 'https://www.vseinstrumenti.ru/instrument/svarochnoe-oborudovanie/invertornyj-apparat/orion/varta-200-prof/',
    'https://www.vseinstrumenti.ru/instrument/elektro/perforatory/metabo/khe-2650/',
    'https://www.vseinstrumenti.ru/instrument/elektro/bolgarki/bosch/gws-15-150-cih/'
  ];
  
  const proxyHandler = new ProxyHandler();
  await proxyHandler.fetchProxies();
  
  // Тестируем с рабочим прокси
  const proxy = proxyHandler.getNextProxy();
  
  for (let i = 0; i < testUrls.length; i++) {
    const productUrl = testUrls[i];
    console.log(`\n🎯 [URL ${i+1}/${testUrls.length}] Тестируем: ${productUrl}`);
    
    await testSingleUrl(productUrl, proxy, i + 1);
    
    if (i < testUrls.length - 1) {
      console.log('⏱️ Пауза 3 секунды...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
};

const testSingleUrl = async (productUrl, proxy, urlIndex) => {
  let browser = null;
  let page = null;
  
  try {
    // Максимально реалистичные настройки браузера
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--exclude-switch=enable-automation',
        '--disable-extensions-file-access-check',
        '--disable-extensions-http-throttling',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-web-security',
        '--metrics-recording-only',
        '--no-first-run',
        '--no-default-browser-check',
        '--password-store=basic',
        '--use-mock-keychain',
        '--window-size=1920,1080',
        '--force-device-scale-factor=1'
      ]
    };
    
    if (proxy) {
      launchOptions.proxy = {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password
      };
      console.log(`🌐 [PROXY] Используем: ${proxy.country} ${proxy.host}:${proxy.port}`);
    } else {
      console.log('🏠 [DIRECT] Прямое подключение');
    }
    
    browser = await chromium.launch(launchOptions);
    page = await browser.newPage();
    
    // Устанавливаем viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Реалистичные заголовки
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
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
    });
    
    // Добавляем анти-детекцию
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
      });
      
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true
      });
      
      Object.defineProperty(navigator, 'language', {
        get: () => 'ru-RU',
        configurable: true
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
        configurable: true
      });
      
      // Chrome object simulation
      window.chrome = {
        runtime: {
          id: 'nmmhkkegccagdldgiimedpiccmgmieda'
        }
      };
    });
    
    page.setDefaultTimeout(30000);
    
    // ПРЯМОЙ переход к товару (без трехэтапной навигации)
    console.log('🎯 [DIRECT] Прямой переход к товару...');
    
    const response = await page.goto(productUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    const status = response.status();
    const finalUrl = page.url();
    
    console.log(`📡 [RESPONSE] Статус: ${status}`);
    console.log(`🔗 [URL] Финальный URL: ${finalUrl}`);
    
    // Сохраняем скриншот
    const screenshotPath = path.join(debugDir, `url-${urlIndex}-status-${status}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 [SCREENSHOT] Сохранен: ${screenshotPath}`);
    
    // Сохраняем HTML
    const content = await page.content();
    const htmlPath = path.join(debugDir, `url-${urlIndex}-status-${status}.html`);
    fs.writeFileSync(htmlPath, content);
    console.log(`📄 [HTML] Сохранен: ${htmlPath}`);
    
    // Получаем title страницы
    const title = await page.title();
    console.log(`📋 [TITLE] "${title}"`);
    
    // Проверяем наличие ключевых элементов
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const pageInfo = await page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        hasAddToCartButton: false,
        hasProductTitle: false,
        hasPrice: false,
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'No body',
        buttonCount: document.querySelectorAll('button').length,
        h1Count: document.querySelectorAll('h1').length,
        allButtons: []
      };
      
      // Ищем кнопки
      const buttons = document.querySelectorAll('button');
      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        info.allButtons.push({
          text: buttons[i].textContent?.trim()?.substring(0, 50),
          disabled: buttons[i].disabled,
          className: buttons[i].className
        });
      }
      
      // Ищем H1
      const h1 = document.querySelector('h1');
      if (h1) {
        info.hasProductTitle = true;
        info.productTitle = h1.textContent?.trim()?.substring(0, 100);
      }
      
      // Ищем цену
      const priceSelectors = [
        '[data-qa="price-now"]',
        '[data-behavior="price-now"]',
        '.current-price',
        '.price-current'
      ];
      
      for (const selector of priceSelectors) {
        if (document.querySelector(selector)) {
          info.hasPrice = true;
          break;
        }
      }
      
      // Ищем кнопку "В корзину"
      const cartSelectors = [
        '[data-qa="product-add-to-cart-button"]',
        'button[title="В корзину"]',
        '.add-to-cart'
      ];
      
      for (const selector of cartSelectors) {
        if (document.querySelector(selector)) {
          info.hasAddToCartButton = true;
          break;
        }
      }
      
      return info;
    });
    
    // Выводим детальную информацию
    console.log('\n🔍 [АНАЛИЗ СТРАНИЦЫ]:');
    console.log(`  📋 Title: "${pageInfo.title}"`);
    console.log(`  🎯 Product H1: ${pageInfo.hasProductTitle ? '✅' : '❌'} ${pageInfo.productTitle || ''}`);
    console.log(`  💰 Price found: ${pageInfo.hasPrice ? '✅' : '❌'}`);
    console.log(`  🛒 Add to cart: ${pageInfo.hasAddToCartButton ? '✅' : '❌'}`);
    console.log(`  🔢 Buttons: ${pageInfo.buttonCount}, H1s: ${pageInfo.h1Count}`);
    
    if (pageInfo.allButtons.length > 0) {
      console.log(`  🔘 Sample buttons:`);
      pageInfo.allButtons.forEach((btn, i) => {
        console.log(`     ${i+1}. "${btn.text}" (disabled: ${btn.disabled})`);
      });
    }
    
    console.log(`  📜 Page text excerpt: "${pageInfo.bodyText?.substring(0, 200)}..."`);
    
    // Определяем тип страницы
    let pageType = 'unknown';
    if (status === 404) {
      pageType = 'not_found';
    } else if (status === 403) {
      pageType = 'blocked';
    } else if (pageInfo.title.includes('Главная')) {
      pageType = 'homepage';
    } else if (pageInfo.title.includes('Выберите') || pageInfo.title.includes('город')) {
      pageType = 'city_selection';
    } else if (pageInfo.hasAddToCartButton && pageInfo.hasProductTitle) {
      pageType = 'product_page';
    } else if (pageInfo.hasProductTitle) {
      pageType = 'product_page_incomplete';
    }
    
    console.log(`  🏷️ Page type: ${pageType}`);
    
    return {
      success: pageType === 'product_page',
      pageType,
      status,
      info: pageInfo
    };
    
  } catch (error) {
    console.log(`❌ [ERROR] ${error.message}`);
    
    // Сохраняем скриншот ошибки если возможно
    if (page) {
      try {
        const errorScreenshotPath = path.join(debugDir, `url-${urlIndex}-error.png`);
        await page.screenshot({ path: errorScreenshotPath });
        console.log(`📸 [ERROR SCREENSHOT] ${errorScreenshotPath}`);
      } catch (e) {
        // Игнорируем ошибки скриншота
      }
    }
    
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

// Запускаем отладку
const main = async () => {
  try {
    const targetUrl = process.argv[2];
    await debugParsing(targetUrl);
    console.log('\n🎉 Отладка завершена! Проверьте папку debug/ для скриншотов и HTML');
  } catch (error) {
    console.log(`❌ Критическая ошибка: ${error.message}`);
  }
};

main().catch(console.error); 