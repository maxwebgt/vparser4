import { chromium } from 'playwright';
import ProxyHandler from './modules/proxyHandler.js';

console.log('🛒 ПАРСЕР НАЛИЧИЯ С ПОДДЕРЖКОЙ ПРОКСИ');
console.log('🔍 ВКЛЮЧЕН ДЕТАЛЬНЫЙ РЕЖИМ ОТЛАДКИ (dumpio)\n');

const parseProductAvailability = async (targetUrl = null) => {
  // Тестовый URL по умолчанию
  const productUrl = targetUrl || 'https://www.vseinstrumenti.ru/product/vibratsionnyj-nasos-sibrteh-svn300-15-kabel-15-m-99302-1338303/';
  
  console.log(`🎯 Целевой URL: ${productUrl}\n`);
  
  // Инициализируем proxy handler
  const proxyHandler = new ProxyHandler();
  await proxyHandler.fetchProxies();
  
  const maxAttempts = 8; // Увеличиваем количество попыток
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
    
    // 🚨 КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Меняем прокси только если ВСЕ этапы провалились
    if (result.needNewProxy) {
      if (currentProxy) {
        console.log(`🔄 [PROXY] Прокси ${currentProxy.host}:${currentProxy.port} провалил все этапы - меняем`);
        proxyHandler.markProxyFailed(currentProxy, 'ALL_STAGES_FAILED');
      }
      
      // Получаем новый прокси
      currentProxy = proxyHandler.getNextProxy();
      if (!currentProxy) {
        console.log('❌ [ERROR] Все прокси исчерпаны');
        break;
      }
      usedProxy = true;
      console.log(`🆕 [PROXY] Переключились на новый прокси: ${currentProxy.host}:${currentProxy.port}`);
    }
    
    // Пауза между попытками
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n❌ Все попытки исчерпаны');
  proxyHandler.printStats();
  return null;
};

const attemptParsing = async (attempt, proxy, productUrl, proxyHandler) => {
  let browser = null;
  let page = null;
  
  try {
    console.log(`\n🚀 [ATTEMPT ${attempt}] Запуск браузера...`);
    
    // Настройки браузера
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
        '--disable-features=VizDisplayCompositor'
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
    
    // Запускаем браузер с dumpio для детального анализа
    browser = await chromium.launch({
      ...launchOptions,
      dumpio: true // Включаем детальные логи браузера
    });
    
    // Создаем новый контекст браузера для изоляции сессий
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      // При смене прокси создаём свежие сессии
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    page = await context.newPage();
    
    // 🔍 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ всех HTTP запросов и ответов
    page.on('request', request => {
      const url = request.url();
      if (url.includes('vseinstrumenti.ru') || url.includes('servicepipe.ru')) {
        console.log(`📤 [REQUEST] ${request.method()} ${url}`);
        const headers = request.headers();
        console.log(`   🔧 Headers: User-Agent=${headers['user-agent']?.substring(0, 50)}...`);
        if (headers['referer']) {
          console.log(`   🔧 Referer: ${headers['referer']}`);
        }
      }
    });
    
    page.on('response', async response => {
      const status = response.status();
      const url = response.url();
      
      // Логируем все ответы от целевого сайта
      if (url.includes('vseinstrumenti.ru') || url.includes('servicepipe.ru')) {
        console.log(`📥 [RESPONSE] ${status} ${url}`);
        
        // Детальный анализ 403 ответов
        if (status === 403) {
          console.log(`   🚫 [403 DETAILS] URL: ${url}`);
          const headers = response.headers();
          console.log(`   🚫 [403 HEADERS] server: ${headers['server'] || 'unknown'}`);
          console.log(`   🚫 [403 HEADERS] content-type: ${headers['content-type'] || 'unknown'}`);
          
          // Пытаемся получить тело ответа для анализа
          try {
            const body = await response.text();
            if (body.length < 500) {
              console.log(`   🚫 [403 BODY] ${body.substring(0, 200)}...`);
            }
          } catch (e) {
            console.log(`   🚫 [403 BODY] Не удалось получить тело ответа`);
          }
        }
        
        // Логируем перенаправления
        if (status >= 300 && status < 400) {
          const location = response.headers()['location'];
          console.log(`   🔄 [REDIRECT] ${status} -> ${location}`);
        }
      }
    });
    
    // Отслеживаем консоль браузера
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`🔴 [BROWSER ERROR] ${msg.text()}`);
      }
    });
    
    // Устанавливаем таймауты
    page.setDefaultTimeout(45000); // Увеличиваем таймаут
    
    // 🚀 [НАВИГАЦИЯ] Трехэтапная навигация для vseinstrumenti.ru
    let stageResults = { 
      stage1_success: false, 
      stage2_success: false, 
      stage3_success: false,
      stage1_403: false, 
      stage2_403: false, 
      stage3_403: false 
    };
    
    console.log(`\n🎯 [NAVIGATION] Начинаем трехэтапную навигацию для ${proxy ? 'ПРОКСИ' : 'ПРЯМОГО'} подключения...`);
    
    if (productUrl.includes('vseinstrumenti.ru')) {      
      // Этап 1: Главная страница
      console.log('\n🏠 [STAGE 1/3] Загружаем главную страницу...');
      try {
        const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        const homeStatus = homeResponse.status();
        console.log(`✅ [STAGE 1/3] Главная загружена, статус: ${homeStatus}`);
        
        if (homeStatus === 403) {
          console.log('🚫 [STAGE 1] HTTP 403 на главной странице - НОРМАЛЬНО для первого этапа');
          stageResults.stage1_403 = true;
          proxyHandler.registerProtectionHit();
        } else if (homeStatus === 200) {
          stageResults.stage1_success = true;
          console.log('✅ [STAGE 1] HTTP 200 - главная загружена успешно');
        }
        
        // Даем время на загрузку скриптов защиты
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`❌ [STAGE 1] Ошибка загрузки главной: ${error.message}`);
      }
      
      // Этап 2: Установка города (даем каждому прокси шанс!)
      console.log('\n🏙️ [STAGE 2/3] Устанавливаем город...');
      try {
        const cityResponse = await page.goto('https://www.vseinstrumenti.ru/represent/change/?represent_id=1', { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        const cityStatus = cityResponse.status();
        console.log(`✅ [STAGE 2/3] Город установлен, статус: ${cityStatus}`);
        
        if (cityStatus === 403) {
          console.log('🚫 [STAGE 2] HTTP 403 на установке города');
          stageResults.stage2_403 = true;
          proxyHandler.registerProtectionHit();
        } else if (cityStatus === 200) {
          stageResults.stage2_success = true;
          console.log('✅ [STAGE 2] HTTP 200 - город установлен успешно');
        }
        
        // Пауза для обработки
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`❌ [STAGE 2] Ошибка установки города: ${error.message}`);
      }
      
      // Этап 3: Переход к товару (последний шанс для прокси)
      console.log('\n🛒 [STAGE 3/3] Переходим к товару...');
    }
    
    // Переходим к товару
    try {
      const productResponse = await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      
      const productStatus = productResponse.status();
      console.log(`✅ [STAGE 3/3] Товар загружен, статус: ${productStatus}`);
      
      if (productStatus === 403) {
        console.log('🚫 [STAGE 3] HTTP 403 на странице товара');
        stageResults.stage3_403 = true;
        proxyHandler.registerProtectionHit();
      } else if (productStatus === 200) {
        stageResults.stage3_success = true;
        console.log('✅ [STAGE 3] HTTP 200 - товар загружен успешно');
      }
      
    } catch (error) {
      console.log(`❌ [STAGE 3] Ошибка загрузки товара: ${error.message}`);
    }
    
    // 📊 ДЕТАЛЬНЫЙ АНАЛИЗ РЕЗУЛЬТАТОВ ВСЕХ ЭТАПОВ
    const successCount = Object.keys(stageResults).filter(key => key.includes('success') && stageResults[key]).length;
    const error403Count = Object.keys(stageResults).filter(key => key.includes('403') && stageResults[key]).length;
    
    console.log(`\n📊 [DETAILED ANALYSIS] Детальный анализ этапов:`);
    console.log(`   ✅ Успешных этапов: ${successCount}/3`);
    console.log(`   🚫 Этапов с 403: ${error403Count}/3`);
    console.log(`   🔍 Этап 1 (главная): ${stageResults.stage1_success ? '✅' : (stageResults.stage1_403 ? '403' : '❌')}`);
    console.log(`   🔍 Этап 2 (город): ${stageResults.stage2_success ? '✅' : (stageResults.stage2_403 ? '403' : '❌')}`);
    console.log(`   🔍 Этап 3 (товар): ${stageResults.stage3_success ? '✅' : (stageResults.stage3_403 ? '403' : '❌')}`);
    
    // 🧠 УМНАЯ ЛОГИКА ПРИНЯТИЯ РЕШЕНИЙ
    
    // Если прямое подключение - позволяем 403 на первом этапе
    if (!proxy) {
      console.log(`\n🧠 [DECISION] Анализ для ПРЯМОГО подключения:`);
      
      // Для прямого подключения 403 на первом этапе - норма
      if (stageResults.stage1_403 && (stageResults.stage2_success || stageResults.stage3_success)) {
        console.log(`   ✅ Первый этап 403 - нормально, последующие успешны`);
      } else if (error403Count >= 3) {
        console.log(`   🚫 Все этапы провалены - возможна блокировка IP`);
        return { success: false, needNewProxy: false };
      }
    } else {
      // Для прокси - анализируем строже
      console.log(`\n🧠 [DECISION] Анализ для ПРОКСИ ${proxy.host}:${proxy.port}:`);
      
      if (error403Count >= 3) {
        console.log(`   🚫 ВСЕ этапы провалены (3/3) - прокси полностью заблокирован`);
        return { success: false, needNewProxy: true };
      } else if (error403Count >= 2) {
        console.log(`   ⚠️ Большинство этапов провалено (${error403Count}/3) - даем прокси еще шанс`);
        // Не меняем прокси сразу, даем еще попытку
      } else if (successCount >= 1) {
        console.log(`   ✅ Есть успешные этапы (${successCount}/3) - прокси работает`);
      }
         }
     
     // 🔍 ПРОВЕРКА НА ВОЗМОЖНОСТЬ ПАРСИНГА
     let canProceedToParsing = false;
     
     if (!proxy) {
       // Для прямого подключения: если есть хотя бы один успешный этап ИЛИ только первый этап 403
       canProceedToParsing = (successCount >= 1) || (stageResults.stage1_403 && !stageResults.stage2_403 && !stageResults.stage3_403);
     } else {
       // Для прокси: если есть хотя бы один успешный этап
       canProceedToParsing = (successCount >= 1);
     }
     
     if (!canProceedToParsing) {
       console.log(`\n❌ [PARSING] Невозможно продолжить парсинг - страница недоступна`);
       
       // Проверяем статус товара
       try {
         const finalResponse = await page.goto(productUrl, { waitUntil: 'load', timeout: 30000 });
         const finalStatus = finalResponse.status();
         
         if (finalStatus === 404) {
           console.log('📭 [INFO] HTTP 404 - товар не найден');
           return { success: false, needNewProxy: false };
         }
       } catch (e) {
         console.log(`❌ [ERROR] Ошибка финальной проверки: ${e.message}`);
       }
       
       if (proxy && error403Count >= 3) {
         return { success: false, needNewProxy: true };
       }
       
       return { success: false, needNewProxy: false };
     }
     
     console.log(`\n✅ [PARSING] Продолжаем парсинг - доступ к странице получен`);
     
     // Ждем загрузку контента
     await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 🔍 [PARSING] Парсим наличие
    console.log('\n🔍 ПАРСИНГ НАЛИЧИЯ...');
    
    const availabilityData = await page.evaluate(() => {
      const data = {};
      
      // 1. Ищем кнопку "В корзину"
      let addToCartBtn = document.querySelector('[data-qa="product-add-to-cart-button"]') ||
                         document.querySelector('button[title="В корзину"]') ||
                         document.querySelector('.add-to-cart') ||
                         document.querySelector('.OnnEZB button');
      
      // Если не нашли специфичные селекторы, ищем по тексту
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
          
          // 2. Ищем количество
          const availabilityEl = document.querySelector('[data-qa="availability-info"]');
          if (availabilityEl) {
            const quantityText = availabilityEl.textContent;
            data.availabilityText = quantityText;
            
            // Парсим количество
            let exactMatch = quantityText.match(/(\d+)\s*шт/);
            if (exactMatch) {
              data.quantity = parseInt(exactMatch[1]);
            } else {
              let moreMatch = quantityText.match(/[>больше|более]\s*(\d+)\s*шт/i);
              if (moreMatch) {
                data.quantity = parseInt(moreMatch[1]);
              } else {
                data.quantity = 1;
              }
            }
          } else {
            data.quantity = 1;
          }
          
          // 3. Дополнительная информация о доставке
          const deliveryInfos = [];
          
          const pickupElement = document.querySelector('[data-qa="product-availability"]');
          if (pickupElement) {
            const pickupText = pickupElement.innerText.trim();
            const pickupMatch = pickupText.match(/Самовывоз:(.+)/);
            if (pickupMatch) {
              deliveryInfos.push(`Самовывоз: ${pickupMatch[1].trim()}`);
            }
          }
          
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
    
    // Выводим результаты
    console.log('\n📦 === РЕЗУЛЬТАТ ПАРСИНГА ===');
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
    
    console.log('=======================================');
    
    return { 
      success: availabilityData.availability !== 'unknown', 
      needNewProxy: false, 
      data: availabilityData 
    };
    
  } catch (error) {
    console.log(`❌ [ERROR] Ошибка на попытке ${attempt}: ${error.message}`);
    
    // Проверяем на таймауты и сетевые ошибки
    if (error.message.includes('net::ERR_TIMED_OUT') || 
        error.message.includes('Timeout') ||
        error.message.includes('net::ERR_PROXY_CONNECTION_FAILED')) {
      
      if (proxy) {
        console.log('🔴 [PROXY] Прокси не отвечает или заблокирован');
        return { success: false, needNewProxy: true };
      }
    }
    
    return { success: false, needNewProxy: false };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

// Запускаем парсинг
const main = async () => {
  try {
    // Можно передать URL как аргумент командной строки
    const targetUrl = process.argv[2];
    const result = await parseProductAvailability(targetUrl);
    
    if (result) {
      console.log('\n🎉 ПАРСИНГ ЗАВЕРШЕН УСПЕШНО!');
    } else {
      console.log('\n❌ ПАРСИНГ НЕ УДАЛСЯ');
    }
  } catch (error) {
    console.log(`❌ Критическая ошибка: ${error.message}`);
  }
};

main().catch(console.error); 