import fs from 'fs';
import path from 'path';
import { log } from './logger.js';
import { saveDiagnostics } from './diagnostics.js';

// Function to safely evaluate page properties
export const safeEvaluate = async (page, evaluateFn, defaultValue = {}, timeout = 3000) => {
  try {
    const resultPromise = page.evaluate(evaluateFn);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Evaluation timed out')), timeout)
    );
    
    return await Promise.race([resultPromise, timeoutPromise]);
  } catch (e) {
    log(`Evaluation failed: ${e.message}`, 'debug');
    return defaultValue;
  }
};

// Extract product name from page
export const extractProductName = async (page) => {
  try {
    console.log(`🔍 Looking for product name...`);
    
    // Проверяем на защиту от ботов
    const currentUrl = page.url();
    if (currentUrl.includes('/xpvnsulc/')) {
      console.log(`❌ Bot protection detected in URL: ${currentUrl.substring(0, 100)}...`);
      return null;
    }
    
    const title = await page.title().catch(() => 'No title');
    console.log(`📄 Page title: "${title}"`);
    
    // Проверяем есть ли вообще элементы на странице
    const pageInfo = await page.evaluate(() => {
      return {
        hasBody: !!document.body,
        bodyLength: document.body ? document.body.innerText.length : 0,
        h1Count: document.querySelectorAll('h1').length,
        totalElements: document.querySelectorAll('*').length
      };
    });
    console.log(`📊 Page info: body=${pageInfo.hasBody}, bodyLength=${pageInfo.bodyLength}, h1Count=${pageInfo.h1Count}, totalElements=${pageInfo.totalElements}`);
    
    // Ждём загрузки основных элементов страницы
    try {
      await page.waitForSelector('h1', { timeout: 5000 });
    } catch (e) {
      console.log(`⚠️ Timeout waiting for h1 element, continuing anyway`);
    }
    
    // ИСПРАВЛЕННЫЕ селекторы для поиска названия товара (как в API)
    const selectors = [
      'h1[data-qa="get-product-title"]', // Главный селектор vseinstrumenti.ru
      'h1.product__title',
      'h1.product-name',
      '.product-title h1',
      '.product h1',
      'h1[class*="product"]',
      'h1[id*="product"]',
      'h1[itemprop="name"]',
      '.product-page-title h1',
      '.product-header h1',
      '.product-info h1',
      '.main-product-title',
      '[data-testid="product-title"]',
      '[data-qa="product-name"]',
      'h1' // Generic fallback
    ];
    
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const name = await element.evaluate(el => el.textContent.trim());
          if (name) {
            console.log(`✅ Found product name with selector "${selector}": "${name}"`);
            return name;
          } else {
            console.log(`⚠️ Element found but no text for selector: "${selector}"`);
          }
        } else {
          console.log(`❌ No element found for selector: "${selector}"`);
        }
      } catch (error) {
        console.log(`❌ Error with selector "${selector}": ${error.message}`);
        continue; // Try next selector
      }
    }
    
    // Try a more general approach if all selectors fail
    try {
      const name = await page.evaluate(() => {
        // Look for any h1 that might contain product name
        const h1Elements = Array.from(document.querySelectorAll('h1'));
        for (const h1 of h1Elements) {
          const text = h1.textContent.trim();
          if (text.length > 0 && text.length < 200) { // Simple heuristic for a good title
            return text;
          }
        }
        
        // Look for meta title as fallback
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) {
          return metaTitle.getAttribute('content');
        }
        
        // Look for document title as last resort
        return document.title.split('|')[0].trim();
      });
      
      if (name) {
        console.log(`✅ Found product name using advanced extraction: "${name}"`);
        return name;
      }
    } catch (error) {
      console.log(`❌ Advanced name extraction failed: ${error.message}`);
    }
    
    console.log(`❌ All product name selectors failed`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting product name:`, error);
    return null;
  }
};

// Extract price from page
export const extractProductPrice = async (page) => {
  try {
    console.log(`🔍 Looking for product price...`);
    
    // Проверяем на защиту от ботов
    const currentUrl = page.url();
    if (currentUrl.includes('/xpvnsulc/')) {
      console.log(`❌ Bot protection detected in URL: ${currentUrl.substring(0, 100)}...`);
      return null;
    }
    
    // Ждём загрузки ценовых элементов
    try {
      await page.waitForSelector('[data-qa="product-price"], .price, [itemprop="price"]', { timeout: 5000 });
    } catch (e) {
      console.log(`⚠️ Timeout waiting for price elements, continuing anyway`);
    }
    
    // ИСПРАВЛЕННЫЕ селекторы для цены (как в API)
    const priceSelectors = [
      // VSE специфичные селекторы - НОВЫЕ правильные селекторы
      '[data-qa="price-now"]',
      '[data-behavior="price-now"]', 
      '.N2sK2A [data-qa="price-now"]',
      '.N2sK2A [data-behavior="price-now"]',
      '._typography_snzga_46._heading_snzga_7[data-qa="price-now"]',
      
      // Старые VSE селекторы  
      '.NjdAF6 p.typography.heading',
      '.pwSQ4P .typography.heading',
      '[data-qa="product-price"] .typography',
      '[data-qa="product-price-current"]',
      '[data-qa="product-price"]',
      
      // Schema.org селекторы
      '[itemprop="price"]',
      'meta[itemprop="price"]',
      '[typeof="Product"] [property="price"]',
      
      // Общие селекторы для цены
      '.current-price',
      '.price-current',
      '.price-value',
      '.price',
      '.product-price',
      '.product-card__price-current', 
      '.price--pdp-price-block',
      '.price-block__final-price',
      
      // CSS классы с числами и валютой
      '[class*="price"]:not(script):not(style)',
      
      // Более агрессивный поиск
      '.typography.heading'
    ];
    
    for (const selector of priceSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          let priceText = '';
          
          // Специальная обработка для meta-тегов
          if (selector.startsWith('meta[')) {
            priceText = await element.evaluate(el => el.getAttribute('content') || '');
          } else {
            priceText = await element.evaluate(el => {
              // Получаем чистый текст, убираем HTML комментарии и неразрывные пробелы
              let text = el.textContent || el.innerText || '';
              // Заменяем неразрывные пробелы (\u00A0) на обычные пробелы
              text = text.replace(/\u00A0/g, ' ');
              // Убираем лишние пробелы
              text = text.replace(/\s+/g, ' ').trim();
              return text;
            });
          }
          
          if (priceText) {
            console.log(`🔍 Checking price text from "${selector}": "${priceText.substring(0, 100)}..."`);
            
            // УЛУЧШЕННОЕ извлечение цены - ищем все числа и выбираем подходящую цену
            // Ищем числа с учетом возможных пробелов и валютных символов
            const allNumbers = priceText.match(/\d[\d\s\u00A0]*\d|\d/g);
            if (allNumbers) {
              for (const numberStr of allNumbers) {
                const cleanNumber = numberStr.replace(/\s+/g, '');
                const price = parseFloat(cleanNumber);
                
                // Проверяем что это разумная цена (не мелочь и не слишком большая)
                if (!isNaN(price) && price >= 100 && price <= 500000) {
                  console.log(`✅ Found valid price: ${price} (from number: "${numberStr}")`);
                  return price;
                }
              }
            }
            
            // Fallback - старый метод
            const priceMatch = priceText.match(/[\d\s,.]+/);
            if (priceMatch) {
              const price = parseFloat(priceMatch[0].replace(/\s+/g, '').replace(',', '.'));
              if (!isNaN(price) && price > 0) {
                console.log(`✅ Found price with fallback method "${selector}": ${price}`);
                return price;
              }
            }
          }
        }
      } catch (error) {
        continue; // Try next selector
      }
    }
    
    // Advanced price extraction if all selectors fail
    try {
      const price = await page.evaluate(() => {
        // Look for any elements with currency symbols
        const currencySymbols = ['₽', '$', '€', '£', '¥'];
        const priceRegex = new RegExp(`[\\d\\s,.]+\\s*(${currencySymbols.join('|')})|` + 
                                    `(${currencySymbols.join('|')})\\s*[\\d\\s,.]+`);
        
        // Find elements containing price patterns
        const priceElements = Array.from(document.querySelectorAll('*')).filter(el => {
          // Очищаем текст от неразрывных пробелов и лишних символов
          let text = el.textContent || el.innerText || '';
          text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
          
          return priceRegex.test(text) && 
                !el.matches('body, html, script, style, head') && 
                text.length < 100; // Avoid selecting large text blocks
        });
        
        if (priceElements.length > 0) {
          // Sort by depth in DOM (prefer shallower elements)
          priceElements.sort((a, b) => {
            let depthA = 0, depthB = 0;
            let el = a;
            while (el) { depthA++; el = el.parentElement; }
            el = b;
            while (el) { depthB++; el = el.parentElement; }
            return depthA - depthB;
          });
          
          // Extract numeric value from the best candidate
          let priceText = priceElements[0].textContent || priceElements[0].innerText || '';
          priceText = priceText.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
          
          const priceMatch = priceText.match(/[\d\s\u00A0,.]+/);
          return priceMatch ? parseFloat(priceMatch[0].replace(/[\s\u00A0]+/g, '').replace(',', '.')) : null;
        }
        
        // Final fallback: look for schema.org price data
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            if (data.offers && data.offers.price) {
              return parseFloat(data.offers.price);
            }
            if (data.price) {
              return parseFloat(data.price);
            }
          } catch (e) {
            // JSON parsing failed
          }
        }
        
        return null;
      });
      
      if (price) {
        console.log(`✅ Found price using advanced extraction: ${price}`);
        return price;
      }
    } catch (error) {
      console.log(`❌ Advanced price extraction failed: ${error.message}`);
    }
    
    console.log(`❌ All price selectors failed`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting product price:`, error);
    return null;
  }
};

// Extract availability from page
export const extractProductAvailability = async (page) => {
  try {
    console.log(`🔍 Looking for product availability...`);
    
    // Проверяем на защиту от ботов
    const currentUrl = page.url();
    if (currentUrl.includes('/xpvnsulc/')) {
      console.log(`❌ Bot protection detected in URL: ${currentUrl.substring(0, 100)}...`);
      return { availability: 'unavailable', quantity: 0 };
    }
    
    // Check if page is valid before attempting to extract availability
    const isValidPage = await page.evaluate(() => {
      return document && document.body && document.documentElement.outerHTML.length > 0;
    }).catch(() => false);
    
    if (!isValidPage) {
      console.log(`❌ Page appears to be invalid or empty, skipping availability extraction`);
      return { availability: 'unavailable', quantity: 0 };
    }
    
    const availabilityData = await page.evaluate(() => {
      try {
        // ИСПРАВЛЕННАЯ логика поиска кнопки "В корзину" (как в рабочем API)
        let addToCartBtn = document.querySelector('[data-qa="product-add-to-cart-button"]') ||
                           document.querySelector('button[title="В корзину"]') ||
                           document.querySelector('.add-to-cart') ||
                           document.querySelector('.OnnEZB button') ||
                           document.querySelector('[class*="add-to-cart"]') ||
                           document.querySelector('[class*="buy-button"]') ||
                           document.querySelector('button[data-qa*="add-to-cart"]') ||
                           document.querySelector('button[data-qa*="buy"]');
        
        // Поиск по тексту кнопки если не нашли по селекторам
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
        
        if (addToCartBtn && !addToCartBtn.disabled && !addToCartBtn.classList.contains('disabled')) {
          // Товар в наличии - ищем количество
          let quantity = null;
          
          const availabilityEl = document.querySelector('[data-qa="availability-info"]');
          if (availabilityEl) {
            const quantityText = availabilityEl.textContent;
            
            // ИСПРАВЛЕННАЯ логика извлечения количества (как в API)
            // 1. Точное число: "351 шт"
            let exactMatch = quantityText.match(/(\d+)\s*шт/);
            if (exactMatch) {
              quantity = parseInt(exactMatch[1]);
            }
            
            // 2. Больше числа: "> 100 шт", "более 100 шт"
            if (!quantity) {
              let moreMatch = quantityText.match(/[>больше|более]\s*(\d+)\s*шт/i);
              if (moreMatch) {
                quantity = parseInt(moreMatch[1]);
              }
            }
            
            // 3. В вашем городе: "В вашем городе > 100 шт"  
            if (!quantity) {
              let cityMatch = quantityText.match(/в\s*вашем\s*городе[^>]*>\s*(\d+)\s*шт/i);
              if (cityMatch) {
                quantity = parseInt(cityMatch[1]);
              }
            }
            
            // 4. Просто число без "шт": "351"
            if (!quantity) {
              let numberMatch = quantityText.match(/(\d+)/);
              if (numberMatch) {
                let num = parseInt(numberMatch[1]);
                if (num > 0 && num <= 10000) {
                  quantity = num;
                }
              }
            }
          }
          
          return { availability: 'in_stock', quantity: quantity || null };
        } else {
          // Кнопка недоступна или не найдена - товар не в наличии
          return { availability: 'unavailable', quantity: 0 };
        }
      } catch (error) {
        console.error('Error in availability evaluation:', error);
        return { availability: 'unknown', quantity: null };
      }
    }).catch(error => {
      console.error('Failed to execute availability script:', error);
      return { availability: 'unknown', quantity: null };
    });
    
    const availability = availabilityData.availability === 'unknown' ? 'unavailable' : availabilityData.availability;
    const quantity = availabilityData.quantity !== null ? availabilityData.quantity : 0;
    
    console.log(`✅ Found availability: ${availability}, quantity: ${quantity}`);
    return { availability, quantity };
  } catch (error) {
    console.error(`❌ Error extracting product availability:`, error);
    return { availability: 'unavailable', quantity: 0 };
  }
};

// Add VSE Instrumenti specific selectors
const VSE_INSTRUMENTI_SELECTORS = {
  name: [
    '.product-title__title', 
    '.product-card__title h1', 
    '.product-title h1',
    '[itemprop="name"]',
    '.product__title',
    '.card-description-title .title'
  ],
  price: [
    '.product-card__price-current', 
    '.price--pdp-price-block',
    '.product-card__price-current--with-discount',
    '.current-price',
    '.price-block__final-price'
  ],
  description: [
    '.product-card-description-content',
    '.js-product-description',
    '.product-description'
  ],
  inStock: [
    '.order-button-stock__text',
    '.order-button-stock',
    '.product-status'
  ]
};

// Enhanced function to extract product data from page
export const extractProductData = async (page, errorPagesDir) => {
  try {
    console.log(`📊 Extracting data from page: ${await page.url()}`);
    
    // First, make sure the page is stable and fully loaded
    await page.waitForFunction(
      () => document.readyState === 'complete' || document.readyState === 'interactive',
      { timeout: 5000 }
    ).catch(() => console.log(`⚠️ Page may not be fully loaded yet, continuing anyway`));
    
    // Add a small delay to ensure DOM is stable
    await page.waitForTimeout(1000);
    
    // Use a safer way to get page title
    let pageTitle = "";
    try {
      pageTitle = await page.title().catch(() => "");
      console.log(`📄 Page title: "${pageTitle}"`);
    } catch (titleError) {
      console.log(`⚠️ Failed to get page title: ${titleError.message}`);
      
      // Try an alternative approach to get title
      try {
        pageTitle = await page.evaluate(() => document.title).catch(() => "");
        console.log(`📄 Alternative page title: "${pageTitle}"`);
      } catch (altTitleError) {
        console.log(`⚠️ Alternative title approach failed: ${altTitleError.message}`);
      }
    }
    
    // Check if we're on the correct page using a more resilient method
    let isErrorPage = false;
    try {
      isErrorPage = await page.evaluate(() => {
        const title = document.title || '';
        const bodyText = document.body.innerText || '';
        return title.includes('403') || 
               title.includes('404') || 
               title.includes('Error') || 
               title.includes('Доступ запрещен') || 
               title.includes('Защита от роботов') ||
               bodyText.includes('доступ запрещен') ||
               bodyText.includes('страница не найдена');
      }).catch(() => false);
    } catch (evalError) {
      console.log(`⚠️ Error detection failed: ${evalError.message}`);
    }
    
    if (isErrorPage || pageTitle.includes('403') || pageTitle.includes('404')) {
      console.log(`❌ Error page detected: "${pageTitle}"`);
      
      // Save a screenshot for debugging
      try {
        const screenshotPath = path.join(errorPagesDir, `error_page_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      } catch (screenshotErr) {
        console.log(`⚠️ Failed to save error screenshot: ${screenshotErr.message}`);
      }
      
      throw new Error(`Error page detected: ${pageTitle}`);
    }
    
    if (await page.url() === 'about:blank') {
      console.log(`❌ We're on about:blank page! Can't extract data`);
      throw new Error('Cannot extract data from about:blank page');
    }
    
    // Wait for product content to load
    // await page.waitForSelector('.product-page', { timeout: 10000 }).catch(() => {
    //   console.log(`⚠️ Product page selector not found`);
    // });
    
    // Get the current URL
    const url = await page.url();
    
    // Handle VSE Instrumenti specific extraction if needed
    if (url.includes('vseinstrumenti.ru')) {
      log('Detected VSE Instrumenti site, using specialized selectors', 'debug');
      
      // Allow more time for VSE Instrumenti's dynamic content
      await page.waitForTimeout(3000);
      
      // Use specialized extraction for VSE Instrumenti
      const result = await page.evaluate((selectors) => {
        // Helper function to get text from multiple possible selectors
        const getTextFromSelectors = (selectorList) => {
          for (const selector of selectorList) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
              return element.textContent.trim();
            }
          }
          return null;
        };
        
        // Get product info
        const name = getTextFromSelectors(selectors.name);
        const priceText = getTextFromSelectors(selectors.price);
        const description = getTextFromSelectors(selectors.description);
        const stockText = getTextFromSelectors(selectors.inStock);
        
        // Process price - remove non-numeric characters
        let price = null;
        if (priceText) {
          // Extract price with regex to handle different formats
          const priceMatch = priceText.match(/(\d[\d\s.,]*)/);
          if (priceMatch) {
            price = priceMatch[0].trim() + ' ₽';
          }
        }
        
        // Determine if in stock
        let inStock = null;
        if (stockText) {
          inStock = !stockText.toLowerCase().includes('нет в наличии');
        }
        
        // Get images
        const images = Array.from(document.querySelectorAll('.product-card-gallery img, .product-gallery img'))
          .map(img => img.src)
          .filter(src => src && src.length > 0);
        
        // Get specs
        const specs = {};
        const specRows = document.querySelectorAll('.product-properties__item, .properties-row');
        specRows.forEach(row => {
          const key = row.querySelector('.properties-row__name, .product-properties__name')?.textContent.trim();
          const value = row.querySelector('.properties-row__value, .product-properties__value')?.textContent.trim();
          if (key && value) {
            specs[key] = value;
          }
        });
        
        // Debug info
        const debug = {
          bodyLength: document.body.innerHTML.length,
          title: document.title,
          hasMainContent: !!document.querySelector('main, .product-card, .product-detail'),
          headers: Object.keys(selectors).map(key => ({ 
            type: key, 
            found: !!getTextFromSelectors(selectors[key]) 
          }))
        };
        
        return {
          name,
          price,
          description,
          inStock,
          images,
          specs,
          debug
        };
      }, VSE_INSTRUMENTI_SELECTORS);
      
      // Add error handling and logging
      if (result.debug) {
        log(`Debug info: ${JSON.stringify(result.debug)}`, 'debug');
      }
      
      if (!result.name) {
        // If no name found, try fallback methods specific to VSE Instrumenti
        const titleElement = await page.$('title');
        if (titleElement) {
          const title = await page.title();
          if (title && !title.includes('безопасности') && !title.includes('проверка')) {
            // Use page title as product name fallback
            result.name = title.split('|')[0].trim();
          }
        }
      }
      
      // If still no data, throw detailed error
      if (!result.name) {
        // Save HTML for debugging
        const html = await page.content();
        const timestamp = Date.now();
        const htmlPath = path.join(errorPagesDir, `vse_instrumenti_failure_${timestamp}.html`);
        fs.writeFileSync(htmlPath, html);
        
        // Save screenshot
        const screenshotPath = path.join(errorPagesDir, `vse_instrumenti_failure_${timestamp}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        throw new Error('Could not extract VSE Instrumenti product data - HTML saved for analysis');
      }
      
      // Convert the special VSE Instrumenti result into our standard format
      return {
        name: result.name,
        currentPrice: result.price ? parseFloat(result.price.replace(/[^\d.]/g, '')) : 0,
        originalPhotoUrl: result.images && result.images.length > 0 ? result.images[0] : null,
        quantity: result.inStock ? 1 : 0,
        availability: result.inStock ? 'in_stock' : 'out_of_stock',
        description: result.description,
        brand: null, // VSE Instrumenti doesn't provide brand in the basic extraction
        structuredData: null,
        sourceUrl: url,
        updatedAt: new Date().toISOString()
      };
    }
    
    // Try to get product name
    const productName = await extractProductName(page);
    if (!productName) {
      console.log(`❌ All product name selectors failed`);
    }
    
    // Try to get price - initial basic extraction
    const initialPrice = await extractProductPrice(page);
    if (!initialPrice) {
      console.log(`❌ Basic price selectors failed`);
    }
    
    // Get full page HTML for debugging if we couldn't find critical data
    if (!productName) {
      console.log(`📑 Saving full page HTML for debugging...`);
      const pageHtml = await page.content();
      const htmlPath = path.join(errorPagesDir, `missing_data_${Date.now()}.html`);
      fs.writeFileSync(htmlPath, pageHtml);
      console.log(`📑 HTML saved to: ${htmlPath}`);
      
      throw new Error('Could not find product name on page');
    }
    
    // Wait for page to fully load with a longer timeout
    await page.waitForFunction(() => {
      return document.readyState === 'complete' || document.readyState === 'interactive';
    }, { timeout: 5000 });
    
    // We still need a small delay to ensure all content is rendered
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to wait for the title specifically, but don't fail if it times out
    try {
      await page.waitForFunction(() => {
        return document.querySelector('h1[data-qa="get-product-title"]') || 
              document.querySelector('h1.product__title') ||
              document.querySelector('h1.product-name') ||
              document.querySelector('.product-title h1') ||
              document.querySelector('h1');
      }, { timeout: 8000 });
    } catch (waitError) {
      log(`Warning: Product title wait timed out, continuing with extraction`, 'warn');
    }
    
    // Extract product name with multiple selector options
    let name = productName; // Use already extracted name if available
    if (!name) {
      const nameSelectors = [
        'h1[data-qa="get-product-title"]',
        'h1.product__title',
        'h1.product-name',
        '.product-title h1',
        'h1.title',
        '.product-info h1',
        '[data-test="product-name"]',
        'h1'
      ];
      
      for (const selector of nameSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            name = await element.evaluate(el => el.textContent.trim());
            break;
          }
        } catch (error) {
          continue; // Try next selector
        }
      }
      
      // If still no name, try more general approach
      if (!name) {
        try {
          name = await page.evaluate(() => {
            // Look for any h1 that might contain product name
            const h1Elements = Array.from(document.querySelectorAll('h1'));
            for (const h1 of h1Elements) {
              const text = h1.textContent.trim();
              if (text.length > 0 && text.length < 200) { // Simple heuristic for a good title
                return text;
              }
            }
            
            // Look for meta title as fallback
            const metaTitle = document.querySelector('meta[property="og:title"]');
            if (metaTitle) {
              return metaTitle.getAttribute('content');
            }
            
            // Look for document title as last resort
            return document.title.split('|')[0].trim();
          });
        } catch (error) {
          log(`Advanced name extraction failed: ${error.message}`, 'debug');
        }
      }
    }
    
    if (!name) {
      throw new Error('Could not find product name on page');
    }

    // Extract price with improved selectors and fallbacks
    // Use initialPrice as a starting point if available
    let price = initialPrice ? parseInt(initialPrice, 10) : null;
    
    // Only try advanced extraction if we don't have a price yet
    if (!price) {
      console.log(`🔍 Attempting advanced price extraction...`);
      const priceSelectors = [
        '.NjdAF6 p.typography.heading',
        '.pwSQ4P .typography.heading',
        '[data-qa="product-price"] .typography',
        '[itemprop="price"]',
        '.current-price',
        '.price-value',
        '.price',
        '.product-price',
        '.offer-price',
        '[data-test="product-price"]',
        '.PEXtdL',
        '.sale-price'
      ];
      
      for (const selector of priceSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const priceText = await element.evaluate(el => el.textContent.trim());
            // Extract numeric value from price string
            const priceMatch = priceText.match(/[\d\s,.]+/);
            if (priceMatch) {
              price = parseFloat(priceMatch[0].replace(/\s+/g, '').replace(',', '.'));
              console.log(`✅ Found price with advanced selector "${selector}": ${price}`);
              break;
            }
          }
        } catch (error) {
          continue; // Try next selector
        }
      }

      // Advanced price extraction fallback
      if (!price) {
        try {
          price = await page.evaluate(() => {
            // Look for any elements with currency symbols
            const currencySymbols = ['₽', '$', '€', '£', '¥'];
            const priceRegex = new RegExp(`[\\d\\s,.]+\\s*(${currencySymbols.join('|')})|` + 
                                        `(${currencySymbols.join('|')})\\s*[\\d\\s,.]+`);
            
            // Find elements containing price patterns
            const priceElements = Array.from(document.querySelectorAll('*')).filter(el => {
              // Очищаем текст от неразрывных пробелов и лишних символов
              let text = el.textContent || el.innerText || '';
              text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
              
              return priceRegex.test(text) && 
                    !el.matches('body, html, script, style, head') && 
                    text.length < 100; // Avoid selecting large text blocks
            });
            
            if (priceElements.length > 0) {
              // Sort by depth in DOM (prefer shallower elements)
              priceElements.sort((a, b) => {
                let depthA = 0, depthB = 0;
                let el = a;
                while (el) { depthA++; el = el.parentElement; }
                el = b;
                while (el) { depthB++; el = el.parentElement; }
                return depthA - depthB;
              });
              
              // Extract numeric value from the best candidate
              let priceText = priceElements[0].textContent || priceElements[0].innerText || '';
              priceText = priceText.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
              
              const priceMatch = priceText.match(/[\d\s\u00A0,.]+/);
              return priceMatch ? parseFloat(priceMatch[0].replace(/[\s\u00A0]+/g, '').replace(',', '.')) : null;
            }
            
            // Final fallback: look for schema.org price data
            const jsonLd = document.querySelector('script[type="application/ld+json"]');
            if (jsonLd) {
              try {
                const data = JSON.parse(jsonLd.textContent);
                if (data.offers && data.offers.price) {
                  return parseFloat(data.offers.price);
                }
                if (data.price) {
                  return parseFloat(data.price);
                }
              } catch (e) {
                // JSON parsing failed, continue
              }
            }
            
            return null;
          });
          if (price) {
            console.log(`✅ Found price using deep extraction: ${price}`);
          }
        } catch (error) {
          log('Advanced price extraction failed: ' + error.message, 'debug');
        }
      }
    }

    // Extract image URL with multiple selector options
    let imageUrl = null;
    const imageSelectors = [
      '.product-page-image__img',
      '.product-img img',
      '.product-gallery__image',
      '.product-image img',
      '[data-test="product-image"] img',
      '.gallery-image',
      '[itemprop="image"]',
      '.product-photo img',
      '.carousel-image'
    ];
    
    for (const selector of imageSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          imageUrl = await element.evaluate(el => el.src);
          break;
        }
      } catch (error) {
        continue; // Try next selector
      }
    }

    // Advanced image extraction fallbacks
    if (!imageUrl) {
      try {
        imageUrl = await page.evaluate(() => {
          // Try meta tags first
          const metaOg = document.querySelector('meta[property="og:image"]');
          if (metaOg) {
            return metaOg.getAttribute('content');
          }
          
          // Look for largest image that might be product image
          const images = Array.from(document.querySelectorAll('img'));
          const productImages = images.filter(img => {
            // Filter by size and position
            const rect = img.getBoundingClientRect();
            return rect.width > 200 && rect.height > 200 && // Reasonably sized
                  rect.top < window.innerHeight && // Visible in first viewport
                  !/logo|banner|ad/i.test(img.src); // Not a logo/banner/ad
          });
          
          // Sort by size (area)
          productImages.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return (bRect.width * bRect.height) - (aRect.width * aRect.height);
          });
          
          return productImages.length > 0 ? productImages[0].src : null;
        });
      } catch (error) {
        log('Advanced image extraction failed: ' + error.message, 'debug');
      }
    }

    // Extract availability status with enhanced detection
    const { availability, quantity } = await extractProductAvailability(page);

    // Extract description with multiple approaches
    let description = null;
    try {
      description = await page.evaluate(() => {
        // Common description selectors
        const descriptionSelectors = [
          '.product-description',
          '[itemprop="description"]',
          '.product__description',
          '#product-description',
          '.description',
          '[data-test="product-description"]',
          '.product-specs',
          '.product-details'
        ];
        
        for (const selector of descriptionSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            return el.textContent.trim();
          }
        }
        
        // Try meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          return metaDesc.getAttribute('content');
        }
        
        // Try structured data
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            if (data.description) {
              return data.description;
            }
          } catch (e) {
            // JSON parsing failed, continue
          }
        }
        
        return null;
      });
    } catch (error) {
      log('Description extraction failed: ' + error.message, 'debug');
    }

    // Extract brand information
    let brand = null;
    try {
      brand = await page.evaluate(() => {
        // Common brand selectors
        const brandSelectors = [
          '[itemprop="brand"]',
          '.product-brand',
          '.brand',
          '[data-test="product-brand"]'
        ];
        
        for (const selector of brandSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            return el.textContent.trim();
          }
        }
        
        // Try structured data
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            if (data.brand && data.brand.name) {
              return data.brand.name;
            }
            if (data.brand) {
              return data.brand;
            }
          } catch (e) {
            // JSON parsing failed, continue
          }
        }
        
        return null;
      });
    } catch (error) {
      log('Brand extraction failed: ' + error.message, 'debug');
    }

    // Extract any structured product data if available
    let structuredData = null;
    try {
      structuredData = await page.evaluate(() => {
        const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
        const productData = [];
        
        jsonLdElements.forEach(element => {
          try {
            const data = JSON.parse(element.textContent);
            
            // Look for product type or product properties
            if (data['@type'] === 'Product' || 
                (data['@graph'] && data['@graph'].some(item => item['@type'] === 'Product'))) {
              productData.push(data);
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        });
        
        return productData.length > 0 ? productData : null;
      });
    } catch (error) {
      log('Structured data extraction failed: ' + error.message, 'debug');
    }

    // Compile the product data object
    const productData = {
      name,
      currentPrice: price || 0,  // Changed from 'price' to 'currentPrice' to match schema
      originalPhotoUrl: imageUrl, // Changed from 'imageUrl' to 'originalPhotoUrl' to match schema
      quantity,
      availability,
      description,
      brand,
      structuredData,
      sourceUrl: page.url(),
      updatedAt: new Date().toISOString()
    };

    log(`Successfully extracted product data: ${name} (Price: ${price || 'N/A'})`, 'info');
    console.log(`📊 EXTRACTED DATA:`, productData);
    
    return productData;
  } catch (error) {
    console.error(`❌ DATA EXTRACTION ERROR:`, error);
    log('Error extracting product data: ' + error.message, 'error');
    
    // Save the error page HTML for diagnosis
    const errorPagePath = await saveDiagnostics(page, page.url(), errorPagesDir);
    
    throw new Error(`Failed to extract product data: ${error.message} (Error page saved to: ${errorPagePath})`);
  }
};

export default {
  safeEvaluate,
  extractProductName,
  extractProductPrice,
  extractProductAvailability,
  extractProductData
};
