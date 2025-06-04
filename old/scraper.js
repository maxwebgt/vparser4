import fs from 'fs';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file and directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import our modules
import * as dataExtractor from './modules/dataExtractor.js';
import { connectToDatabase, closeDatabaseConnection, isDatabaseConnected } from './modules/db.js';
import ProductModel from './modules/product.js';
import { updateProductInDatabase } from './modules/databaseHandler.js';
import { log, setupLogger, shortenUrl, logNetworkRequest, resetSessionCounters } from './modules/logger.js';
import { getProxyHandler, getCountryEmoji } from './modules/proxyHandler.js';
import { getMetricsTracker } from './modules/metrics.js';
import { PROXY_CONFIG } from './modules/config.js';

// Setup logger to capture console output
setupLogger();

// Глобальные переменные для отслеживания ресурсов
let browser = null;
let isShuttingDown = false;

// Функция для корректного завершения работы приложения
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    log('🔄 Завершение уже выполняется...', 'warning');
    return;
  }
  
  isShuttingDown = true;
  log(`⚠️ Получен сигнал ${signal}. Выполняем корректное завершение...`, 'info');
  
  try {
    // Закрываем браузер если он открыт
    if (browser) {
      log('🌐 Закрытие браузера...', 'info');
      await browser.close();
      browser = null;
    }
    
    // Закрываем соединение с базой данных
    if (isDatabaseConnected()) {
      log('🗄️ Закрытие соединения с базой данных...', 'info');
      await closeDatabaseConnection();
    }
    
    log('✅ Приложение корректно завершено', 'success');
    process.exit(0);
  } catch (error) {
    log(`❌ Ошибка при корректном завершении: ${error.message}`, 'error');
    process.exit(1);
  }
};

// Устанавливаем обработчики сигналов
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Обработчик некритических ошибок
process.on('unhandledRejection', (reason, promise) => {
  log(`⚠️ Необработанное отклонение Promise: ${reason}`, 'warning');
  // Не завершаем процесс, только логируем
});

process.on('uncaughtException', (error) => {
  log(`❌ Некритическая ошибка: ${error.message}`, 'error');
  // Пытаемся завершить корректно
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Configuration
const MAX_RETRIES = 3;
const PAGE_LOAD_TIMEOUT = 60000; // 60 seconds timeout
const SELECTOR_TIMEOUT = 10000; // 10 seconds for selector timeout
const ERROR_DIR = path.join(__dirname, 'errors');

// City representation configuration
const CITY_CONFIG = {
  representId: 1, // Default city ID (can be changed via command line)
  representType: 'common',
  enabled: true // Can be toggled to disable the city representation feature
};

// Global constants for easy configuration
const PROBLEMATIC_DOMAINS = new Set(['vseinstrumenti.ru']);

// Track redirect loop errors to prevent repeating them
const redirectErrorUrls = new Set();

/**
 * Handles redirect loops by disabling city representation for problematic URLs
 * @param {string} url - The URL that experienced redirect loop
 * @returns {boolean} - Whether this is a new redirect loop
 */
const handleRedirectLoop = (url) => {
  try {
    // Create a base URL without query parameters for tracking
    let baseUrl = url;
    
    // Clean up the URL to get a consistent format
    if (url.includes('?')) {
      baseUrl = url.split('?')[0];
    }
    
    // If URL contains represent/change, extract the actual product URL
    if (url.includes('represent/change')) {
      try {
        const params = new URL(url).searchParams;
        const redirectUrl = params.get('url_to_redirect');
        if (redirectUrl) {
          baseUrl = decodeURIComponent(redirectUrl);
        }
      } catch (e) {
        // Just use the original URL if we can't extract
      }
    }
    
    // Check if this URL has had redirect issues before
    if (redirectErrorUrls.has(baseUrl)) {
      log(`🔄 Redirect loop previously detected for this URL, using direct navigation`, 'info');
      return false;
    }
    
    // Add this URL to our tracking set
    redirectErrorUrls.add(baseUrl);
    log(`🔄 First redirect loop for ${baseUrl}, permanently disabling city representation for this URL`, 'warning');
    return true;
  } catch (e) {
    log(`Error in handleRedirectLoop: ${e.message}`, 'error');
    return false;
  }
};

/**
 * Gets direct URL without city representation
 * @param {string} url - The original URL which might have city representation
 * @returns {string} - Direct URL without city representation
 */
const getDirectUrl = (url) => {
  if (url.includes('represent/change')) {
    // Extract the redirected URL from the represent/change URL
    try {
      const params = new URL(url).searchParams;
      const redirectUrl = params.get('url_to_redirect');
      if (redirectUrl) {
        return decodeURIComponent(redirectUrl);
      }
    } catch (e) {
      log(`Error extracting direct URL: ${e.message}`, 'error');
    }
  }
  return url;
};

/**
 * Checks if a URL should skip city representation
 * @param {string} url - The URL to check
 * @returns {boolean} - True if city representation should be skipped
 */
const shouldSkipCityRepresentation = (url) => {
  try {
    // Get base URL without parameters
    const baseUrl = url.split('?')[0];
    
    // Check if this URL has had issues with city representation before
    if (redirectErrorUrls.has(baseUrl)) {
      return true;
    }
    
    // Extract domain to see if it's in our problematic domains list
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    return PROBLEMATIC_DOMAINS.has(domain) && CITY_CONFIG.enabled;
  } catch (e) {
    // If there's any error parsing the URL, better to skip city representation
    return true;
  }
};

/**
 * Transforms a product URL to include city representation
 * @param {string} originalUrl - The original product URL
 * @param {number} cityId - The city representation ID
 * @returns {string} - The transformed URL with city representation
 */
const transformUrlWithCityRepresentation = (originalUrl, cityId = CITY_CONFIG.representId) => {
  // Skip city representation for URLs that have had issues
  if (shouldSkipCityRepresentation(originalUrl)) {
    return originalUrl;
  }
  
  // Only transform vseinstrumenti.ru URLs 
  if (!originalUrl.includes('vseinstrumenti.ru') || !CITY_CONFIG.enabled) {
    return originalUrl;
  }
  
  // Check if URL already has representation parameters
  if (originalUrl.includes('represent/change')) {
    return originalUrl;
  }
  
  // Get domain part (with protocol)
  const urlObj = new URL(originalUrl);
  const domain = `${urlObj.protocol}//${urlObj.hostname}`;
  
  // Construct the new URL with city representation
  return `${domain}/represent/change/?represent_id=${cityId}&represent_type=${CITY_CONFIG.representType}&url_to_redirect=${encodeURIComponent(originalUrl)}`;
};

// Ensure error directory exists
if (!fs.existsSync(ERROR_DIR)) {
  fs.mkdirSync(ERROR_DIR, { recursive: true });
}

// Global state management
let useProxies = false;
let currentProxy = null;

/**
 * Улучшенная функция извлечения данных продукта - БЫСТРАЯ И НАДЕЖНАЯ
 * @param {Object} page - Puppeteer page объект
 * @param {string} earlyPageTitle - Заголовок страницы полученный ранее
 * @returns {Object} - Извлеченные данные продукта
 */
const extractProductDataImproved = async (page, earlyPageTitle = null) => {
  try {
    log('🚀 [EXTRACT] Запуск улучшенной функции извлечения данных', 'debug');
    
    // *** ШАГ 1: БЫСТРАЯ ПРОВЕРКА НА ЗАЩИТУ/ОШИБКУ ***
    log('📋 [EXTRACT] Шаг 1: Получаем заголовок страницы...', 'debug');
    const pageTitle = earlyPageTitle || await page.evaluate(() => document.title);
    log(`📄 [EXTRACT] Page title: "${pageTitle}"`, 'debug');
    
    // Проверяем заголовок на индикаторы ошибок/защиты
    if (pageTitle) {
      log('🔍 [EXTRACT] Проверяем заголовок на индикаторы ошибок...', 'debug');
      const errorIndicators = [
        'Страница не найдена',
        'Page Not Found', 
        '404', '403', '500',
        'Ошибка', 'Error',
        'Forbidden', 'Доступ запрещен',
        'Captcha', 'Security Check',
        'DDoS Protection'
      ];
      
      for (const indicator of errorIndicators) {
        if (pageTitle.includes(indicator)) {
          log(`❌ [EXTRACT] Найден индикатор ошибки: "${indicator}" в заголовке`, 'debug');
          throw new Error(`🛡️ Защита/ошибка обнаружена в заголовке: "${pageTitle}"`);
        }
      }
      
      // Проверяем на общий заголовок сайта (редирект на главную)
      if (pageTitle.trim() === 'ВсеИнструменты.ру' || 
          pageTitle.includes('Главная - ВсеИнструменты.ру')) {
        log(`🏠 [EXTRACT] Обнаружен редирект на главную страницу`, 'debug');
        throw new Error(`🏠 Редирект на главную страницу: "${pageTitle}"`);
      }
      
      log('✅ [EXTRACT] Заголовок прошел проверку на ошибки', 'debug');
    }
    
    // *** ШАГ 2: БЫСТРОЕ ИЗВЛЕЧЕНИЕ ДАННЫХ С КОНКРЕТНЫМИ СЕЛЕКТОРАМИ ***
    log('⚡ [EXTRACT] Шаг 2: Быстрое извлечение данных...', 'debug');
    
    // Минимальное ожидание для загрузки контента
    log('⏰ [EXTRACT] Ожидание загрузки контента (1000ms)...', 'debug');
    await new Promise(resolve => setTimeout(resolve, 1000));
    log('✅ [EXTRACT] Ожидание завершено', 'debug');
    
    log('🔍 [EXTRACT] Выполняем page.evaluate() для извлечения данных...', 'debug');
    const productData = await page.evaluate(() => {
      // Извлекаем все данные за один раз для максимальной скорости
      const data = {};
      
      // Добавляем информацию для отладки
      data.debugInfo = {};
      
      // Проверяем что document существует
      if (!document) {
        throw new Error('Document не доступен');
      }
      
      try {
        // 1. НАЗВАНИЕ - из заголовка H1 или title
        const h1Element = document.querySelector('h1[data-qa="get-product-title"]') ||
                          document.querySelector('h1.product__title') ||
                          document.querySelector('h1');
        
        if (h1Element && h1Element.textContent.trim()) {
          data.name = h1Element.textContent.trim();
        } else {
          // Fallback к title страницы
          const title = document.title;
          if (title && title.length > 10) {
            data.name = title
              .replace(/\s*-\s*ВсеИнструменты\.ру.*$/i, '')
              .replace(/\s*-\s*выгодная цена.*$/i, '')
              .replace(/\s*-\s*купить.*$/i, '')
              .trim();
          }
        }
        
        // 2. ЦЕНА - УЛУЧШЕННЫЕ СЕЛЕКТОРЫ из meta-тега или DOM
        const priceMeta = document.querySelector('meta[itemprop="price"]');
        if (priceMeta && priceMeta.getAttribute('content')) {
          const priceValue = parseFloat(priceMeta.getAttribute('content'));
          if (!isNaN(priceValue) && priceValue > 0) {
            data.price = priceValue;
          }
        }
        
        // Fallback поиск цены в DOM с НОВЫМИ СЕЛЕКТОРАМИ
        if (!data.price) {
          const priceSelectors = [
            // *** НОВЫЕ ПРАВИЛЬНЫЕ СЕЛЕКТОРЫ ИЗ INDEX.JS ***
            '[data-qa="price-now"]',
            '[data-behavior="price-now"]',
            '.N2sK2A [data-qa="price-now"]',
            '.N2sK2A [data-behavior="price-now"]',
            '._typography_snzga_46._heading_snzga_7[data-qa="price-now"]',
            
            // Старые селекторы как fallback
            '[data-qa="product-price"] .typography',
            '[data-qa="product-price-current"]',
            '.current-price',
            '.price-current',
            '.price-value'
          ];
          
          for (const selector of priceSelectors) {
            const priceEl = document.querySelector(selector);
            if (priceEl) {
              // *** УЛУЧШЕННАЯ ОБРАБОТКА НЕРАЗРЫВНЫХ ПРОБЕЛОВ ***
              let priceText = priceEl.textContent || priceEl.innerText || '';
              // Заменяем неразрывные пробелы (\u00A0) на обычные пробелы
              priceText = priceText.replace(/\u00A0/g, ' ');
              // Убираем лишние пробелы
              priceText = priceText.replace(/\s+/g, ' ').trim();
              
              console.log(`🔍 Checking price from "${selector}": "${priceText}"`);
              
              // Ищем числа в тексте (включая возможные пробелы)
              const priceMatch = priceText.match(/\d[\d\s\u00A0]*\d|\d+/);
              if (priceMatch) {
                const cleanedPrice = priceMatch[0].replace(/[\s\u00A0]+/g, '').replace(',', '.');
                const price = parseFloat(cleanedPrice);
                if (!isNaN(price) && price > 0) {
                  console.log(`✅ Found price: ${price}`);
                  data.price = price;
                  break;
                }
              }
            }
          }
        }
        
        // 3. ИЗОБРАЖЕНИЕ - основное изображение товара
        const imageSelectors = [
          '.product-page-image__img',
          '.product-img img',
          '.product-gallery__image',
          '[data-qa="product-image"] img',
          '.gallery-image',
          '[itemprop="image"]',
          '.product-photo img',
          '.carousel-image'
        ];
        
        for (const selector of imageSelectors) {
          const imgEl = document.querySelector(selector);
          if (imgEl && imgEl.src) {
            data.imageUrl = imgEl.src;
            break;
          }
        }
        
        // Fallback к meta og:image
        if (!data.imageUrl) {
          const metaOg = document.querySelector('meta[property="og:image"]');
          if (metaOg) {
            data.imageUrl = metaOg.getAttribute('content');
          }
        }
        
        // 4. КОЛИЧЕСТВО/НАЛИЧИЕ - УЛУЧШЕННЫЕ СЕЛЕКТОРЫ из кнопки "В корзину"
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
        
        // Сохраняем отладочную информацию
        data.debugInfo.addToCartBtn = !!addToCartBtn;
        data.debugInfo.totalButtons = document.querySelectorAll('button').length;
        
        if (addToCartBtn) {
          data.debugInfo.btnDisabled = addToCartBtn.disabled;
          data.debugInfo.btnHasDisabledClass = addToCartBtn.classList.contains('disabled');
          data.debugInfo.btnText = addToCartBtn.textContent.trim();
        }
        
        if (addToCartBtn && !addToCartBtn.disabled && !addToCartBtn.classList.contains('disabled')) {
          data.availability = 'in_stock';
          
          // Пытаемся найти точное количество
          const availabilityEl = document.querySelector('[data-qa="availability-info"]');
          if (availabilityEl) {
            const quantityText = availabilityEl.textContent;
            data.debugInfo.availabilityText = quantityText;
            
            // Проверяем различные форматы количества
            let quantity = null;
            
            // 1. Точное число: "351 шт"
            let exactMatch = quantityText.match(/(\d+)\s*шт/);
            if (exactMatch) {
              quantity = parseInt(exactMatch[1]);
            }
            
            // 2. Больше числа: "> 100 шт", "более 100 шт"
            if (!quantity) {
              let moreMatch = quantityText.match(/[>больше|более]\s*(\d+)\s*шт/i);
              if (moreMatch) {
                quantity = parseInt(moreMatch[1]); // Берём базовое число
              }
            }
            
            if (quantity !== null) {
              data.quantity = quantity;
            } else {
              data.quantity = 1; // Минимальное количество для покупки
            }
          } else {
            data.quantity = 1; // По умолчанию
          }
        } else {
          data.availability = 'out_of_stock';
          data.quantity = 0;
        }
        
        return data;
        
      } catch (evalError) {
        throw new Error(`Ошибка в page.evaluate: ${evalError.message}`);
      }
    });
    
    log('✅ [EXTRACT] page.evaluate() успешно выполнен', 'debug');
    log(`📊 [EXTRACT] Извлеченные данные: name="${productData.name}", price=${productData.price}, availability=${productData.availability}`, 'debug');
    
    return productData;
    
  } catch (error) {
    log(`❌ [EXTRACT] Ошибка в extractProductDataImproved: ${error.message}`, 'debug');
    throw error;
  }
};

// Function to determine if a response contains bot protection - ENHANCED
const isBotProtection = async (page, extractionResult) => {
  try {
    // Check URL first - this is the most reliable indicator
    const currentUrl = page.url();
    if (currentUrl.includes('/xpvnsulc/')) {
      log(`Bot protection detected: URL contains /xpvnsulc/`, 'warning');
      return true;
    }
    
    // *** НОВАЯ ПРОВЕРКА: Детекция редиректов (как в API) ***
    const pageTitle = await page.title().catch(() => '');
    
    // Проверяем на редирект на главную страницу
    if (pageTitle === 'ВсеИнструменты.ру' || 
        pageTitle.includes('Главная - ВсеИнструменты.ру') ||
        pageTitle.includes('Выберите город')) {
      log(`Redirect to main page detected: "${pageTitle}"`, 'warning');
      return true;
    }
    
    // Проверяем заголовки страниц ошибок
    const errorIndicators = [
      'Страница не найдена',
      'Page Not Found', 
      '404', '403', '500',
      'Ошибка', 'Error',
      'Forbidden', 'Доступ запрещен',
      'Captcha', 'Security Check',
      'DDoS Protection'
    ];
    
    for (const indicator of errorIndicators) {
      if (pageTitle.includes(indicator)) {
        log(`Error page detected in title: "${pageTitle}" (matched: "${indicator}")`, 'warning');
        return true;
      }
    }
    
    // Only consider it bot protection if we couldn't extract ANY product data
    // AND there are specific indicators of bot protection
    if (!extractionResult.name && !extractionResult.currentPrice) {
      const botProtectionIndicators = await page.evaluate(() => {
        // Look for VERY SPECIFIC bot protection elements
        const html = document.documentElement.outerHTML.toLowerCase();
        
        // These are specific to protection systems, NOT product pages
        const specificBotProtectionSigns = [
          "captcha",
          "security check",
          "проверка безопасности",
          "защита от роботов",
          "cloudflare",
          "проверка браузера"
        ];
        
        // Look for forms specifically related to bot protection
        const hasCaptchaForm = !!document.querySelector('form.captcha, form.bot-check, form.security-check');
        
        // Check if the title ONLY contains protection-related terms (not product info)
        const title = document.title.toLowerCase();
        const titleIsOnlyAboutProtection = 
          /^(captcha|security check|проверка безопасности|защита от роботов)/.test(title) ||
          !title.includes("купить") && !title.includes("цена") && !title.includes("товар");
        
        // Find specific text patterns that indicate bot protection, not normal pages
        const hasProtectionPatterns = specificBotProtectionSigns.some(sign => html.includes(sign));
        
        // *** НОВАЯ ПРОВЕРКА: Детекция региональных страниц ***
        const bodyText = document.body ? document.body.innerText : '';
        const hasRegionalIndicators = 
          bodyText.includes('Выберите ваш город') ||
          (bodyText.includes('Екатеринбург') && bodyText.includes('Москва') && bodyText.includes('Санкт-Петербург')) ||
          (bodyText.includes('Каталог товаров') && !document.querySelector('h1[data-qa="get-product-title"]'));
        
        // Return result with detailed reason for debugging
        return {
          isProtected: hasCaptchaForm || (titleIsOnlyAboutProtection && hasProtectionPatterns) || hasRegionalIndicators,
          reason: hasCaptchaForm ? "captcha form detected" : 
                  (titleIsOnlyAboutProtection && hasProtectionPatterns) ? "protection title and patterns" : 
                  hasRegionalIndicators ? "regional page detected" :
                  "not a bot protection page"
        };
      });
      
      if (botProtectionIndicators.isProtected) {
        log(`Bot protection detected: ${botProtectionIndicators.reason}`, 'warning');
        return true;
      }
    }
  } catch (error) {
    log(`Error checking for bot protection: ${error.message}`, 'error');
  }
  
  return false;
};

/**
 * Enhanced check for error pages with additional context awareness
 * @param {string} name - The extracted product name
 * @param {Object} page - The Puppeteer page object for additional checks
 * @returns {Promise<Object>} - Error status and type information
 */
const checkErrorPage = async (name, page) => {
  if (!name) return { isError: false };
  
  // Basic error messages that indicate an error page
  const errorMessages = [
    "this page isn't working",
    "this page isn't available",
    "page not found",
    "404",
    "error",
    "sorry",
    "not available",
    "страница не работает",
    "страница недоступна",
    "страница не найдена"
  ];
  
  // Convert to lowercase for case-insensitive matching
  const lowerName = name.toLowerCase();
  
  // Check if the name contains any error message
  const matchedError = errorMessages.find(msg => lowerName.includes(msg));
  
  // If matched an error, log it immediately for debugging
  if (matchedError) {
    log(`🚨 Error page indicator detected in product name: "${name}" (matched: "${matchedError}")`, 'warning');
    
    // Take a snapshot of the current page state for debugging
    try {
      const url = await page.url();
      const title = await page.title();
      const h1Text = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1 ? h1.innerText : 'No H1 found';
      });
      const bodyText = await page.evaluate(() => {
        return document.body ? document.body.innerText.substring(0, 500) + '...' : 'No body found';
      });
      
      log(`📊 Page State Debug - URL: ${url}`, 'debug');
      log(`📊 Page State Debug - Title: ${title}`, 'debug');
      log(`📊 Page State Debug - H1: ${h1Text}`, 'debug');
      log(`📊 Page State Debug - Body excerpt: ${bodyText.replace(/\n/g, ' ')}`, 'debug');
    } catch (e) {
      log(`Failed to capture page state for debugging: ${e.message}`, 'error');
    }
  }

  if (!matchedError) return { isError: false };

  // If we've matched an error, check for signs this might be temporary
  try {
    // Check page content for signs this is a temporary error vs permanent
    const isPermanentError = await page.evaluate(() => {
      // Look for permanent error indicators
      const html = document.body.innerHTML.toLowerCase();
      const permanentErrorSigns = [
        "товар больше не продается",
        "product has been discontinued",
        "больше не доступен",
        "permanently unavailable",
        "removed from our catalog"
      ];
      
      return permanentErrorSigns.some(sign => html.includes(sign));
    });
    
    // If this page has "Страница недоступна" but doesn't have permanent error signs,
    // mark it as a temporary error
    const isTemporaryError = lowerName.includes("страница недоступна") && !isPermanentError;
    
    const result = {
      isError: true, 
      errorType: isTemporaryError ? 'temporary' : 'permanent',
      errorMessage: matchedError
    };
    
    log(`🛑 Error page verified - Type: ${result.errorType}, Message: "${result.errorMessage}"`, 'warning');
    return result;
  } catch (e) {
    // If we can't evaluate, assume it's a normal error
    log(`⚠️ Error during page evaluation for error detection: ${e.message}`, 'warning');
    return {
      isError: true, 
      errorType: 'unknown',
      errorMessage: matchedError
    };
  }
};

/**
 * Safely logs a URL, truncating protection URLs to avoid console clutter
 * @param {string} url - The URL to log
 * @param {string} prefix - Optional prefix for the log
 * @param {string} level - Log level
 */
const safelyLogUrl = (url, prefix = '', level = 'debug') => {
  // Check if this is a protection URL
  if (url.includes('/xpvnsulc/')) {
    // Only show the beginning of protection URLs
    const truncatedUrl = url.substring(0, url.indexOf('?')) + '?...';
    log(`${prefix}${truncatedUrl} (Protection page)`, level);
  } else {
    // Log normal URLs completely
    log(`${prefix}${url}`, level);
  }
};

/**
 * Clears cookies for a specific domain to help with redirect issues
 * @param {Object} page - Puppeteer page object
 * @param {string} domain - Domain to clear cookies for
 * @returns {Promise<void>}
 */
const clearCookiesForDomain = async (page, domain = 'vseinstrumenti.ru') => {
  try {
    if (!page || !page.browser()) {
      log(`Cannot clear cookies: page is not valid`, 'debug');
      return;
    }
    
    // Get all current cookies
    const cookies = await page.cookies();
    
    // Find cookies matching our domain
    const domainCookies = cookies.filter(cookie => 
      cookie.domain.includes(domain) || domain.includes(cookie.domain)
    );
    
    if (domainCookies.length > 0) {
      // Delete each cookie for the domain
      for (const cookie of domainCookies) {
        await page.deleteCookie(cookie);
      }
      log(`🍪 Cleared ${domainCookies.length} cookies for ${domain}`, 'debug');
    } else {
      log(`No cookies found for ${domain}`, 'debug');
    }
  } catch (e) {
    log(`Failed to clear cookies: ${e.message}`, 'debug');
    // Don't throw - this is non-critical functionality
  }
};

/**
 * Трехэтапная навигация для vseinstrumenti.ru - ПРОФЕССИОНАЛЬНАЯ ВЕРСИЯ
 * @param {Object} page - Puppeteer page объект  
 * @param {string} targetUrl - Финальный URL товара
 * @param {number} cityId - ID города для установки
 * @param {Object} proxyHandler - Обработчик прокси для регистрации защиты
 * @returns {Promise<Object>} - Объект с результатом навигации
 */
const performThreeStageNavigation = async (page, targetUrl, cityId = CITY_CONFIG.representId, proxyHandler = null) => {
  try {
    log(`🚀 [3-STAGE] === ТРЕХЭТАПНАЯ НАВИГАЦИЯ ===`, 'info');
    log(`🎯 [3-STAGE] Целевой URL: ${shortenUrl(targetUrl)}`, 'debug');
    log(`🏙️ [3-STAGE] Город ID: ${cityId}`, 'debug');
    
    // 📋 [HEADERS] Критически важные заголовки - ТОЧНО КАК В INDEX.JS!
    const professionalHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="136", "Not_A Brand";v="24", "Google Chrome";v="136"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',  // 🔥 КРИТИЧНО: Windows, НЕ Linux!
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'DNT': '1'  // Do Not Track для реалистичности
    };
    
    await page.setExtraHTTPHeaders(professionalHeaders);
    log(`✅ [Headers] Установлено ${Object.keys(professionalHeaders).length} профессиональных заголовков`, 'debug');
    
    // 🔧 [USER-AGENT] Реалистичный User-Agent
    const realistic_user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
    await page.setUserAgent(realistic_user_agent);
    
    // 🖥️ [VIEWPORT] Реалистичный viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });
    
    // 🎭 [АНТИ-ДЕТЕКЦИЯ] ПОЛНАЯ ПРОФЕССИОНАЛЬНАЯ АНТИ-ДЕТЕКЦИЯ ИЗ INDEX.JS
    await page.evaluateOnNewDocument(() => {
      // 🔥 [PLATFORM FIX] Критическое исправление platform detection
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true
      });
      
      // 🖥️ [SCREEN FIX] Реалистичные размеры экрана (НЕ headless!)
      Object.defineProperty(screen, 'width', { get: () => 1920, configurable: true });
      Object.defineProperty(screen, 'height', { get: () => 1080, configurable: true });
      Object.defineProperty(screen, 'availWidth', { get: () => 1920, configurable: true });
      Object.defineProperty(screen, 'availHeight', { get: () => 1040, configurable: true }); // Учитываем taskbar
      Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
      
      // 🔥 [WEBDRIVER ELIMINATION] Полное удаление webdriver следов
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,  // НЕ undefined - именно false!
        configurable: true
      });
      delete navigator.__proto__.webdriver;
      
      // 🌍 [LANGUAGE FIX] Правильная русская локализация
      Object.defineProperty(navigator, 'language', {
        get: () => 'ru-RU',
        configurable: true
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
        configurable: true
      });
      
      // 🔌 [PLUGINS SIMULATION] Имитация реальных плагинов
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const pluginArray = [];
          pluginArray.length = 5;
          pluginArray[Symbol.iterator] = Array.prototype[Symbol.iterator];
          return pluginArray;
        },
        configurable: true
      });
      
      // 🎨 [CHROME SIMULATION] Полная имитация Chrome API
      window.chrome = {
        runtime: {
          id: 'nmmhkkegccagdldgiimedpiccmgmieda',
          onMessage: {},
          onConnect: {},
          sendMessage: function() {},
          connect: function() {},
          getManifest: function() { 
            return {
              name: 'Chrome Extension',
              version: '1.0.0'
            }; 
          }
        },
        loadTimes: function() {
          return {
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            commitLoadTime: Date.now() / 1000,
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other',
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
            npnNegotiatedProtocol: 'unknown',
            wasAlternateProtocolAvailable: false,
            connectionInfo: 'http/1.1'
          };
        },
        csi: function() {
          return {
            startE: Date.now(),
            onloadT: Date.now(),
            pageT: Math.random() * 1000 + 1000,
            tran: Math.floor(Math.random() * 20) + 1
          };
        },
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed'
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running'
          }
        }
      };
      
      // 🔧 [PERMISSIONS API] Реалистичная работа с разрешениями
      if (window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }
      
      // 🔇 [CONSOLE FILTER] Фильтрация подозрительных логов
      const originalConsoleError = console.error;
      console.error = function(...args) {
        const message = args.join(' ');
        // Блокируем только технические ошибки, НЕ влияющие на UX
        if (!message.includes('WebGL') && 
            !message.includes('GroupMarkerNotSet') && 
            !message.includes('swiftshader') &&
            !message.includes('gpu/command_buffer') &&
            !message.includes('dbus') &&
            !message.includes('DevTools')) {
          originalConsoleError.apply(console, args);
        }
      };
      
      // 🕐 [TIMING ATTACKS] Защита от timing attacks
      const originalDateNow = Date.now;
      Date.now = function() {
        return originalDateNow() + Math.floor(Math.random() * 2);
      };
      
      // 🎯 [FINAL TOUCH] Удаляем automation indicators
      window.navigator.webdriver = false;
      delete window.navigator.webdriver;
      
      // Очищаем все automation следы из DOM
      if (document.documentElement) {
        document.documentElement.removeAttribute('webdriver');
      }
    });
    
    // 🏠 [STAGE 1/3] ГЛАВНАЯ СТРАНИЦА
    log(`🏠 [STAGE 1/3] Загружаем главную страницу...`, 'info');
    
    const initialDelay = Math.floor(Math.random() * 1000) + 500;
    log(`⏰ [STAGE 1/3] Начальная задержка: ${initialDelay}ms`, 'debug');
    await new Promise(resolve => setTimeout(resolve, initialDelay));
    
    const homePageStart = Date.now();
    const homeResponse = await page.goto('https://www.vseinstrumenti.ru/', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    
    const homeStatus = homeResponse ? homeResponse.status() : 'unknown';
    log(`✅ [STAGE 1/3] Главная загружена за ${Date.now() - homePageStart}ms, статус: ${homeStatus}`, 'info');
    
    if (homeStatus === 403) {
      log(`🚫 [STAGE 1/3] HTTP 403 обнаружен - регистрируем защиту бота`, 'warning');
      
      // Регистрируем защиту бота если передан proxyHandler
      if (proxyHandler) {
        const shouldUseProxy = proxyHandler.registerProtectionHit();
        log(`🔒 [STAGE 1/3] Защита зарегистрирована. Total hits: ${proxyHandler.getProtectionHitCount()}, Should use proxy: ${shouldUseProxy}`, 'proxy');
        
        return { 
          success: false, 
          needsProxy: shouldUseProxy, 
          stage: 'home', 
          status: 403,
          reason: 'HTTP_403_ON_HOME_PAGE'
        };
      }
      
      log(`❌ [STAGE 1/3] Главная заблокирована: HTTP 403 - ПРОПУСКАЕМ 3-STAGE навигацию`, 'warning');
      return { success: false, needsProxy: false, stage: 'home', status: 403, reason: 'HTTP_403_NO_PROXY_HANDLER' };
    }
    
    // Имитируем просмотр главной
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.mouse.move(500, 300);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 🏙️ [STAGE 2/3] УСТАНОВКА ГОРОДА
    log(`🏙️ [STAGE 2/3] Устанавливаем город ID=${cityId}...`, 'info');
    
    const citySetupStart = Date.now();
    const cityUrl = `https://www.vseinstrumenti.ru/represent/change/?represent_id=${cityId}`;
    log(`🏙️ [STAGE 2/3] URL установки города: ${shortenUrl(cityUrl)}`, 'debug');
    
    const cityResponse = await page.goto(cityUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    const cityStatus = cityResponse ? cityResponse.status() : 'unknown';
    const cityFinalUrl = page.url();
    log(`✅ [STAGE 2/3] Город установлен за ${Date.now() - citySetupStart}ms, статус: ${cityStatus}`, 'info');
    log(`🔍 [STAGE 2/3] Финальный URL: ${shortenUrl(cityFinalUrl)}`, 'debug');
    
    // Проверяем статус этапа города
    if (cityStatus === 403) {
      log(`🚫 [STAGE 2/3] HTTP 403 на этапе города - регистрируем защиту бота`, 'warning');
      
      if (proxyHandler) {
        const shouldUseProxy = proxyHandler.registerProtectionHit();
        log(`🔒 [STAGE 2/3] Защита зарегистрирована. Total hits: ${proxyHandler.getProtectionHitCount()}, Should use proxy: ${shouldUseProxy}`, 'proxy');
        
        return { 
          success: false, 
          needsProxy: shouldUseProxy, 
          stage: 'city', 
          status: 403,
          reason: 'HTTP_403_ON_CITY_PAGE'
        };
      }
      
      return { success: false, needsProxy: false, stage: 'city', status: 403, reason: 'HTTP_403_ON_CITY_NO_PROXY_HANDLER' };
    }
    
    // Ждем установки кук
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 🛒 [STAGE 3/3] НАСТРОЙКА ДЛЯ ТОВАРА
    log(`🛒 [STAGE 3/3] Настраиваем заголовки для товара...`, 'info');
    
    // Устанавливаем правильные заголовки для товара
    await page.setExtraHTTPHeaders({
      ...professionalHeaders,
      'Sec-Fetch-Site': 'same-origin',
      'Referer': cityFinalUrl
    });
    
    log(`✅ [3-STAGE] Трехэтапная навигация завершена успешно!`, 'success');
    return { success: true, needsProxy: false, stage: 'completed', status: 200, reason: 'SUCCESS' };
    
  } catch (error) {
    log(`⚠️ [3-STAGE] Ошибка трехэтапной навигации: ${error.message}`, 'error');
    return { success: false, needsProxy: false, stage: 'error', status: 'error', reason: error.message };
  }
};

/**
 * Waits for navigation to complete and page to stabilize
 * Handles the "Execution context was destroyed" errors from redirects
 * @param {Object} page - Puppeteer page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<Object>} - Navigation result with status information
 */
const safeNavigate = async (page, url, options = {}) => {
  try {
    const response = await page.goto(url, options);
    const status = response ? response.status() : 'unknown';
    
    return { 
      success: true, 
      status: status,
      url: page.url(),
      response: response
    };
  } catch (e) {
    log(`Navigation error: ${e.message}`, 'error');
    return { 
      success: false, 
      status: 'error',
      url: url,
      error: e.message,
      response: null
    };
  }
};

// Function to create browser with or without proxy - PROFESSIONAL ANTI-DETECTION
const createBrowser = async (headless = true, proxy = null) => {
  // 🔧 Определяем путь к исполняемому файлу браузера в зависимости от ОС
  const isWindows = process.platform === 'win32';
  let executablePath = null;
  
  if (isWindows) {
    // Windows: используем встроенный Chromium от Puppeteer или системный Chrome
    const windowsPaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      // Системный Chrome
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      // Edge
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      // Chromium
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
    ].filter(Boolean);
    
    for (const path of windowsPaths) {
      try {
        if (fs.existsSync(path)) {
          executablePath = path;
          log(`✅ [Browser] Найден браузер: ${path}`, 'debug');
          break;
        }
      } catch (e) {
        // Игнорируем ошибки проверки
      }
    }
    
    if (!executablePath) {
      // На Windows оставляем Puppeteer найти браузер автоматически
      log(`🔍 [Browser] Используем автоматический поиск Puppeteer на Windows`, 'debug');
    }
  } else {
    // Linux: старая логика
    const linuxPaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/lib/chromium-browser/chromium-browser',
      '/usr/lib/chromium/chromium',
      '/snap/bin/chromium'
    ].filter(Boolean);
    
    for (const path of linuxPaths) {
      try {
        if (fs.existsSync(path)) {
          const stats = fs.statSync(path);
          // Проверяем что это реальный исполняемый файл, а не симлинк размером 0
          if (stats.size > 1000000) { // Chromium должен быть больше 1MB
            executablePath = path;
            log(`✅ [Chromium] Найден исполняемый файл: ${path} (${Math.round(stats.size / 1024 / 1024)} MB)`, 'debug');
            break;
          }
        }
      } catch (e) {
        // Игнорируем ошибки проверки
      }
    }
    
    if (!executablePath) {
      executablePath = '/usr/bin/google-chrome-stable'; // Google Chrome fallback
      log(`⚠️ [Chromium] Используем fallback путь: ${executablePath}`, 'debug');
    }
    
    // Принудительно используем system Chrome вместо Puppeteer версии
    executablePath = '/usr/bin/google-chrome-stable';
    log(`🔧 [Chromium] Принудительно используем system Chrome: ${executablePath}`, 'debug');
  }

  // 🚀 [PROFESSIONAL ANTI-DETECTION] Профессиональная анти-детекция система
  const launchOptions = { 
    headless: headless ? 'new' : false,
    dumpio: true,  // ✅ ВКЛЮЧАЕМ ДЕТАЛЬНЫЕ ЛОГИ ДЛЯ ОТЛАДКИ
    args: [
      // 🔥 [CORE SECURITY] Основные флаги безопасности
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // 🎭 [ANTI-DETECTION] Критичные флаги для обхода детекции
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
      
      // 🖥️ [REALISTIC DISPLAY] Реалистичные настройки дисплея
      '--window-size=1920,1080',
      '--force-device-scale-factor=1',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      
      // 🔇 [RADICAL SYSTEM ISOLATION] Радикальная изоляция системных служб Linux  
      '--disable-system-sounds',                 // Без системных звуков
      '--disable-notifications',                 // Без уведомлений
      '--disable-default-apps',                  // Без системных приложений  
      '--disable-software-rasterizer',           // Без программного растеризатора
      '--disable-background-networking',         // Без фоновых сетевых запросов
      '--disable-sync',                          // Без синхронизации
      '--disable-translate',                     // Без переводчика
      '--disable-ipc-flooding-protection',       // Уже есть выше, но важно
      
      // 🔌 [D-BUS COMPATIBLE] Флаги совместимые с D-Bus
      '--disable-speech-api',                    // Отключаем Speech API (безопасно)
      '--disable-web-bluetooth',                 // Отключаем Bluetooth (безопасно) 
      '--disable-reading-from-canvas',           // Отключаем чтение из canvas (безопасно)
      '--disable-3d-apis',                       // Отключаем 3D APIs (безопасно)
      
      // 🎥 [VIDEO CAPTURE FIX] Исправляем video capture ошибки
      '--disable-video-capture-service',         // Отключаем video capture service
      '--disable-media-stream',                  // Отключаем media stream
      '--disable-webrtc',                        // Отключаем WebRTC
      '--disable-camera',                        // Отключаем камеру
      '--disable-microphone',                    // Отключаем микрофон
      '--disable-webgl',                         // Отключаем WebGL
      '--disable-webgl2',                        // Отключаем WebGL2
      '--disable-accelerated-video-decode',      // Отключаем аппаратное декодирование видео
      '--disable-accelerated-video-encode',      // Отключаем аппаратное кодирование видео
      
      // 🔐 [MODERATE AUDIO/UI ISOLATION] Умеренная изоляция аудио и UI
      '--disable-audio-output',                  // Отключаем аудио полностью
      '--mute-audio',                            // Отключаем звук
      '--disable-login-animations',              // Отключаем анимации входа
      '--disable-modal-animations',              // Отключаем модальные анимации
      '--disable-search-geolocation-disclosure', // Отключаем геолокацию поиска
      '--disable-domain-reliability',            // Отключаем надежность домена
      '--disable-component-update',              // Отключаем обновления компонентов
      '--disable-client-side-phishing-detection', // Отключаем клиентское обнаружение фишинга
      '--disable-background-timer-throttling',   // Отключаем ограничение фоновых таймеров
      
      // 🔄 [PROCESS MANAGEMENT] Управление процессами  
      '--disable-process-per-site',              // Отключаем процесс для каждого сайта  
      '--process-per-tab',                       // Один процесс на вкладку
      
      // 🔇 [MODERATE LOGGING] Умеренное логирование для диагностики
      '--silent-debugger-extension-api',
      '--disable-extensions-except',
      '--log-level=1',                           // Включаем важные логи для диагностики
      
      // 🌍 [LANGUAGE & LOCALE] Правильная локализация  
      '--lang=ru-RU,ru',
      '--accept-lang=ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    ],
    
    // 🖥️ [REALISTIC VIEWPORT] Реалистичный viewport (НЕ headless признаки!)
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    },
    
    ignoreHTTPSErrors: true
  };

  // Добавляем executablePath только если найден
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  // Add proxy configuration if provided
  if (proxy) {
    log(`🌐 [PROXY-SETUP] Настраиваем прокси: ${proxy.host}:${proxy.port} (${proxy.country})`, 'proxy');
    launchOptions.args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
    
    // НЕ используем --proxy-auth флаг (он не поддерживается в современном Chrome)
    // Аутентификация будет происходить через page.authenticate()
    log(`🔐 [PROXY-SETUP] Аутентификация будет выполнена через page.authenticate()`, 'debug');
  }

  // 🚨 [DBUS-AWARE LINUX FIX] Правильная настройка D-Bus и окружения для Linux серверов
  if (process.platform === 'linux') {
    // НЕ сбрасываем DISPLAY, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS
    // НЕ создаём временные директории, НЕ отключаем D-Bus
    // Только если существует /run/user/UID и там есть D-Bus сокет — выставляем переменные
    const userUid = process.getuid();
    const userRuntimeDir = `/run/user/${userUid}`;
    if (fs.existsSync(userRuntimeDir)) {
      process.env.XDG_RUNTIME_DIR = userRuntimeDir;
      const dbusSocket = `${userRuntimeDir}/bus`;
      if (fs.existsSync(dbusSocket)) {
        process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${dbusSocket}`;
      }
    }
  }
  
  log(`⚙️ [PROFESSIONAL-ANTI-DETECTION] Запускаем браузер с профессиональной анти-детекцией (${launchOptions.args.length} флагов, D-Bus готов к работе)`, 'debug');
  const browserInstance = await puppeteer.launch(launchOptions);
  
  // Сохраняем ссылку на браузер в глобальной переменной для корректного завершения
  browser = browserInstance;
  
  // Проверяем версию браузера
  const browserVersion = await browserInstance.version();
  log(`🔍 [Browser] Версия: ${browserVersion}`, 'debug');
  
  // If we're using a proxy, we'll also set up a global proxy auth listener
  if (proxy) {
    log(`🔐 [PROXY-DEBUG] Настраиваем глобальный обработчик аутентификации для ${proxy.host}:${proxy.port}`, 'debug');
    
    browserInstance.on('targetcreated', async (target) => {
      try {
        const page = await target.page();
        if (page) {
          // Set authentication for each new page
          await page.authenticate({
            username: proxy.username,
            password: proxy.password
          });
          log(`🔐 [PROXY-DEBUG] Аутентификация установлена для новой страницы`, 'debug');
          
          // СОКРАЩЕННОЕ ЛОГИРОВАНИЕ СЕТЕВЫХ ЗАПРОСОВ
          page.on('request', (request) => {
            logNetworkRequest('OUT', request.method(), request.url(), null, 'NET');
            if (request.headers()['proxy-authorization']) {
              log(`🔐 [NET-REQUEST] Proxy-Authorization присутствует`, 'debug');
            }
          });
          
          page.on('requestfailed', (request) => {
            log(`❌ [NET-FAILED] ${request.method()} ${shortenUrl(request.url())} - ${request.failure().errorText}`, 'error');
          });
          
          page.on('response', (response) => {
            if (response.url().includes('vseinstrumenti.ru')) {
              logNetworkRequest('IN', response.request().method(), response.url(), response.status(), 'NET');
              if (response.status() === 403) {
                log(`🚫 [NET-403] Заголовки ответа получены`, 'debug');
              }
            }
          });
        }
      } catch (err) {
        log(`❌ [PROXY-DEBUG] Ошибка настройки обработчика: ${err.message}`, 'error');
      }
    });
  }
  
  return browserInstance;
};

// Function to fetch products from the database
const fetchProductsFromDatabase = async (limit = 0) => {
  try {
    log('Fetching products from database...', 'info');
    
    // Query for products that need updating
    const products = await ProductModel.find(
      { enabled: true }, // Only get enabled products
      {
        _id: 1,
        name: 1,
        url: 1,
        competitors: 1
      }
    ).limit(limit > 0 ? limit : 0);
    
    log(`Fetched ${products.length} products from database`, 'info');
    
    // Create an array of all URLs to scrape (main products + competitors)
    const urlsToScrape = [];
    
    for (const product of products) {
      // Add main product to scrape list
      urlsToScrape.push({
        id: product._id,
        name: product.name,
        url: product.url,
        isCompetitor: false,
        competitorIndex: null
      });
      
      // Add competitors to scrape list if they exist
      if (product.competitors && product.competitors.length > 0) {
        product.competitors.forEach((competitor, index) => {
          if (competitor.enabled !== false) { // Skip disabled competitors
            urlsToScrape.push({
              id: product._id,
              name: competitor.name || 'Unknown Competitor',
              url: competitor.url,
              isCompetitor: true,
              competitorIndex: index
            });
          }
        });
      }
    }
    
    log(`Created scrape list with ${urlsToScrape.length} URLs`, 'info');
    return urlsToScrape;
  } catch (error) {
    log(`Error fetching products from database: ${error.message}`, 'error');
    throw error;
  }
};

// Process products from database
const processProducts = async (headless = true, limit = 0) => {
  try {
    // Сбрасываем счетчики для новой сессии
    resetSessionCounters();
    
    // Start timing the entire process
    const scriptStartTime = new Date();
    
    // Track total network traffic
    let totalTrafficBytes = 0;
    
    // Initialize metrics tracker
    const metrics = getMetricsTracker();
    
    // Initialize proxy handler if needed
    const proxyHandler = await getProxyHandler();
    
    // Connect to database
    await connectToDatabase();
    
    if (!isDatabaseConnected()) {
      throw new Error('Failed to connect to database');
    }
    
    // Fetch products from database
    const productsToScrape = await fetchProductsFromDatabase(limit);
    
    if (productsToScrape.length === 0) {
      log('No products to scrape. Exiting.', 'warning');
      await closeDatabaseConnection();
      return [];
    }
    
    // Launch initial browser without proxy
    log(`Starting browser in ${headless ? 'headless' : 'visible'} mode`, 'info');
    let localBrowser = await createBrowser(headless);
    
    // Process each product
    const results = [];
    
    for (let i = 0; i < productsToScrape.length; i++) {
      // Display progress information before processing each product
      const currentTime = new Date();
      const elapsedTimeMs = currentTime - scriptStartTime;
      const elapsedTimeFormatted = formatElapsedTime(elapsedTimeMs);
      const productsProcessed = i;
      const productsRemaining = productsToScrape.length - i;
      
      // Calculate average time per product (avoid division by zero)
      const avgTimePerProduct = productsProcessed > 0 
        ? elapsedTimeMs / productsProcessed 
        : 0;
      
      // Estimate remaining time based on average
      const estimatedRemainingMs = avgTimePerProduct * productsRemaining;
      const estimatedRemainingFormatted = formatElapsedTime(estimatedRemainingMs);
      
      // Calculate completion percentage
      const completionPercentage = (productsProcessed / productsToScrape.length * 100).toFixed(1);
      
      // Create progress bar (40 chars width)
      const progressBarWidth = 40;
      const filledWidth = Math.round(progressBarWidth * productsProcessed / productsToScrape.length);
      const progressBar = '█'.repeat(filledWidth) + '░'.repeat(progressBarWidth - filledWidth);
      
      // Log the progress information in a nice box format
      console.log('\n');
      log('┌─────────────────── SCRAPING PROGRESS ────────────────────┐', 'info');
      log(`│ Progress: ${progressBar} ${completionPercentage}% │`, 'info');
      log('├──────────────────────────────────────────────────────────┤', 'info');
      log(`│ Total Runtime: ${elapsedTimeFormatted.padEnd(38)} │`, 'info');
      log(`│ Products Processed: ${productsProcessed} of ${productsToScrape.length}${' '.repeat(27 - String(productsProcessed).length - String(productsToScrape.length).length)} │`, 'info');
      log(`│ Products Remaining: ${productsRemaining}${' '.repeat(40 - String(productsRemaining).length)} │`, 'info');
      log(`│ Avg Time per Product: ${formatTime(avgTimePerProduct)}${' '.repeat(33 - formatTime(avgTimePerProduct).length)} │`, 'info');
      log(`│ Total Traffic: ${formatFileSize(totalTrafficBytes).padEnd(37)} │`, 'info');
      log(`│ Estimated Time Remaining: ${estimatedRemainingFormatted}${' '.repeat(30 - estimatedRemainingFormatted.length)} │`, 'info');
      log('└──────────────────────────────────────────────────────────┘', 'info');
      console.log('\n');
      
      // Show current proxy info if using one
      if (currentProxy) {
        log(getProxyStatusDisplay(currentProxy, proxyHandler), 'proxy');
      }
      
      // Start tracking metrics for this request
      const requestMetrics = metrics.startRequest();
      
      const product = productsToScrape[i];
      const { id, name, url, isCompetitor, competitorIndex } = product;
      
      log(`[${i+1}/${productsToScrape.length}] Processing: ${shortenUrl(url)} (${isCompetitor ? 'Competitor' : 'Main Product'})`, 'info');
      
      let extractedData = {
        name: null,
        currentPrice: null,
        availability: 'unavailable',
        quantity: 0,
        error: null
      };
      
      let success = false;
      let botProtectionDetected = false;
      let usedProxy = false;

      // Track if we've already switched to a proxy to avoid multiple switches
      let triedWithProxy = false;
      
      // Лимит попыток с прокси на товар (чтобы не зацикливаться на "сожженных" прокси)
      let proxyAttempts = 0;
      const MAX_PROXY_ATTEMPTS = 3;
      
      // Get a new page
      let page = await localBrowser.newPage();
      
      // Set proxy authentication immediately if using a proxy
      if (currentProxy) {
        log(`🔐 [PROXY-DEBUG] Начинаем аутентификацию прокси ${currentProxy.host}:${currentProxy.port}`, 'debug');
        log(`🔐 [PROXY-DEBUG] Username: ${currentProxy.username}, Password length: ${currentProxy.password?.length || 0}`, 'debug');
        
        await page.authenticate({
          username: currentProxy.username,
          password: currentProxy.password
        });
        
        log(`🔐 [PROXY-DEBUG] Аутентификация прокси установлена успешно`, 'debug');
        
        // СОКРАЩЕННОЕ ЛОГИРОВАНИЕ СЕТЕВЫХ ЗАПРОСОВ ДЛЯ ОСНОВНОЙ СТРАНИЦЫ
        page.on('request', (request) => {
          logNetworkRequest('OUT', request.method(), request.url(), null, 'MAIN');
          const headers = request.headers();
          if (headers['proxy-authorization']) {
            log(`🔐 [MAIN-REQUEST] Proxy-Authorization установлен`, 'debug');
          }
        });
        
        page.on('requestfailed', (request) => {
          log(`❌ [MAIN-FAILED] ${request.method()} ${shortenUrl(request.url())} - ${request.failure().errorText}`, 'error');
          if (request.failure().errorText.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
            log(`🔴 [PROXY-ERROR] Прокси ${currentProxy.host}:${currentProxy.port} не может установить туннель!`, 'error');
          }
        });
        
        page.on('response', (response) => {
          if (response.url().includes('vseinstrumenti.ru')) {
            logNetworkRequest('IN', response.request().method(), response.url(), response.status(), 'MAIN');
            if (response.status() === 403) {
              log(`🚫 [MAIN-403] Ответ 403 получен`, 'debug');
            }
          }
        });
      }
      
      // Set a more realistic user agent - ОБНОВЛЕННАЯ ВЕРСИЯ
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
      
      // Add this: Track if we've seen a redirect loop for this URL
      let hadRedirectLoop = false;
      
      // Implement retry logic with proper redirect and proxy handling
      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        if (attempt > 0) {
          log(`  Retry attempt ${attempt}/${MAX_RETRIES-1}...`, 'info');
        }
        
        try {
          // Check if we need to use a proxy before proceeding with the attempt
          if (botProtectionDetected && !usedProxy) {
            log(`🔒 Bot protection detected before attempt ${attempt+1}, will try with proxy`, 'proxy');
            
            // Проверяем лимит попыток с прокси
            if (proxyAttempts >= MAX_PROXY_ATTEMPTS) {
              log(`⚠️ Достигнут лимит попыток с прокси (${MAX_PROXY_ATTEMPTS}) для товара. Пропускаем.`, 'warning');
              break; // Выходим из цикла попыток
            }
            
            // Ensure PROXY_CONFIG.useProxy is respected
            if (PROXY_CONFIG.useProxy) {
              proxyAttempts++; // Увеличиваем счетчик попыток с прокси
              log(`🔄 Попытка с прокси ${proxyAttempts}/${MAX_PROXY_ATTEMPTS}`, 'proxy');
              
              // Close current page and browser to clean up resources
              await page.close().catch(e => log(`Error closing page: ${e.message}`, 'debug'));
              await localBrowser.close().catch(e => log(`Error closing browser: ${e.message}`, 'debug'));
              
              // Get a working proxy - this is critical
              log(`🔄 Requesting a working proxy...`, 'proxy');
              currentProxy = await proxyHandler.getNextWorkingProxy();
              
              if (currentProxy) {
                log(`✅ Got proxy: ${currentProxy.host}:${currentProxy.port} (${currentProxy.country})`, 'proxy');
                
                // Launch a new browser with the proxy
                localBrowser = await createBrowser(headless, currentProxy);
                page = await localBrowser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
                
                // Update flags
                usedProxy = true;
                useProxies = true;
                
                // Reset bot protection flag to give this proxy a chance
                botProtectionDetected = false;
                
                log(`🌐 Successfully switched to proxy for next attempt`, 'proxy');
              } else {
                log(`⚠️ Failed to get a working proxy, continuing without one`, 'warning');
                localBrowser = await createBrowser(headless);
                page = await localBrowser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
              }
            } else {
              log(`⚠️ Proxy usage is disabled in config (PROXY_CONFIG.useProxy=false)`, 'warning');
            }
          }
          
          // Add extra timeout for proxy requests
          const pageTimeoutMs = currentProxy ? PAGE_LOAD_TIMEOUT * 2 : PAGE_LOAD_TIMEOUT;
          
          // Clear cookies before navigation to help prevent redirect loops
          await clearCookiesForDomain(page);
          
          // *** НОВАЯ УЛУЧШЕННАЯ НАВИГАЦИЯ С ДЕТАЛЬНОЙ ОТЛАДКОЙ ***
                                  log(`🔍 [DEBUG-NAV] URL: ${shortenUrl(url)}`, 'debug');
          log(`🔍 [DEBUG-NAV] hadRedirectLoop: ${hadRedirectLoop}`, 'debug');
          log(`🔍 [DEBUG-NAV] redirectErrorUrls.has: ${redirectErrorUrls.has(url.split('?')[0])}`, 'debug');
          
          // Для vseinstrumenti.ru используем трехэтапную навигацию
          if (url.includes('vseinstrumenti.ru') && !hadRedirectLoop && !redirectErrorUrls.has(url.split('?')[0])) {
            log(`🚀 [NAVIGATION] Используем трехэтапную навигацию для vseinstrumenti.ru`, 'info');
            
            const navigationSuccess = await performThreeStageNavigation(page, url, CITY_CONFIG.representId, proxyHandler);
            
            if (!navigationSuccess.success) {
              log(`❌ [NAVIGATION] Трехэтапная навигация не удалась, пробуем двухэтапный fallback`, 'warning');
              
              // Проверяем нужен ли прокси на основе результата навигации
              if (navigationSuccess.needsProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                log(`🔒 [NAVIGATION] Трехэтапная навигация требует прокси (${navigationSuccess.reason})`, 'proxy');
                botProtectionDetected = true;
                
                // Используем continue чтобы начать новую итерацию с прокси
                continue;
              }
              
              // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
              if (navigationSuccess.status === 403 && usedProxy && currentProxy) {
                log(`🔴 [NAVIGATION] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту - помечаем как failed`, 'proxy');
                proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_3STAGE_NAVIGATION');
                
                // Сбрасываем флаги и пробуем с новым прокси
                usedProxy = false;
                currentProxy = null;
                botProtectionDetected = true;
                continue;
              }
              
              hadRedirectLoop = true; // Помечаем чтобы в следующий раз использовать fallback
              
              // 🏙️ [FALLBACK] ДВУХЭТАПНЫЙ FALLBACK С ГОРОДОМ
              log(`🏙️ [FALLBACK] Этап 1: Устанавливаем город ID=${CITY_CONFIG.representId}...`, 'info');
              const cityFallbackUrl = `https://www.vseinstrumenti.ru/represent/change/?represent_id=${CITY_CONFIG.representId}`;
              
              const cityFallbackResponse = await safeNavigate(page, cityFallbackUrl, { 
                timeout: pageTimeoutMs 
              });
              
              // Проверяем статус города в fallback
              if (cityFallbackResponse.success) {
                log(`✅ [FALLBACK] Город установлен через fallback (статус: ${cityFallbackResponse.status})`, 'info');
                
                // Проверяем 403 на этапе города
                if (cityFallbackResponse.status === 403) {
                  log(`🚫 [FALLBACK] HTTP 403 на этапе города - регистрируем защиту`, 'warning');
                  botProtectionDetected = true;
                  const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                  
                  if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                    log(`🔒 [FALLBACK] Нужен прокси для города. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                    continue; // Начинаем новую итерацию с прокси
                  }
                  
                  // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                  if (usedProxy && currentProxy) {
                    log(`🔴 [FALLBACK] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту города - помечаем как failed`, 'proxy');
                    proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_FALLBACK_CITY');
                    
                    // Сбрасываем флаги и пробуем с новым прокси
                    usedProxy = false;
                    currentProxy = null;
                    botProtectionDetected = true;
                    continue;
                  }
                }
                
                // Ждем установки кук
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 🎯 [FALLBACK] Этап 2: Переходим на товар
                log(`🎯 [FALLBACK] Этап 2: Переходим на товар: ${url}`, 'info');
                const productFallbackResponse = await safeNavigate(page, url, { 
                  timeout: pageTimeoutMs 
                });
                
                if (!productFallbackResponse.success) {
                  // Проверяем статус товара в fallback
                  if (productFallbackResponse.status === 403) {
                    log(`🚫 [FALLBACK] HTTP 403 на товаре - регистрируем защиту`, 'warning');
                    botProtectionDetected = true;
                    const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                    
                    if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                      log(`🔒 [FALLBACK] Нужен прокси для товара. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                      continue; // Начинаем новую итерацию с прокси
                    }
                    
                    // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                    if (usedProxy && currentProxy) {
                      log(`🔴 [FALLBACK] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту товара - помечаем как failed`, 'proxy');
                      proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_FALLBACK_PRODUCT');
                      
                      // Сбрасываем флаги и пробуем с новым прокси
                      usedProxy = false;
                      currentProxy = null;
                      botProtectionDetected = true;
                      continue;
                    }
                  }
                  
                  throw new Error(`Failed to navigate to product page in 2-stage fallback: ${productFallbackResponse.error || 'unknown error'}`);
                }
                
                log(`✅ [FALLBACK] Товар загружен через двухэтапный fallback (статус: ${productFallbackResponse.status})`, 'success');
              } else {
                // Проверяем статус города в fallback если он не успешен
                if (cityFallbackResponse.status === 403) {
                  log(`🚫 [FALLBACK] HTTP 403 на этапе города - регистрируем защиту`, 'warning');
                  botProtectionDetected = true;
                  const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                  
                  if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                    log(`🔒 [FALLBACK] Нужен прокси для города. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                    continue; // Начинаем новую итерацию с прокси
                  }
                  
                  // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                  if (usedProxy && currentProxy) {
                    log(`🔴 [FALLBACK] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту города (неуспешный fallback) - помечаем как failed`, 'proxy');
                    proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_FALLBACK_CITY_FAILED');
                    
                    // Сбрасываем флаги и пробуем с новым прокси
                    usedProxy = false;
                    currentProxy = null;
                    botProtectionDetected = true;
                    continue;
                  }
                }
                
                // Если и двухэтапный fallback не сработал - используем URL трансформацию
                log(`⚠️ [FALLBACK] Двухэтапный fallback не сработал (${cityFallbackResponse.error || 'unknown error'}), используем URL трансформацию`, 'warning');
                const transformedUrl = transformUrlWithCityRepresentation(url, CITY_CONFIG.representId);
                
                log(`🔄 [FALLBACK] URL трансформация: ${shortenUrl(transformedUrl)}`, 'debug');
                const transformFallbackResponse = await safeNavigate(page, transformedUrl, { 
                  timeout: pageTimeoutMs 
                });
                
                if (!transformFallbackResponse.success) {
                  // Проверяем статус в трансформации
                  if (transformFallbackResponse.status === 403) {
                    log(`🚫 [FALLBACK] HTTP 403 в URL трансформации - регистрируем защиту`, 'warning');
                    botProtectionDetected = true;
                    const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                    
                    if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                      log(`🔒 [FALLBACK] Нужен прокси для трансформации. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                      continue; // Начинаем новую итерацию с прокси
                    }
                    
                    // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                    if (usedProxy && currentProxy) {
                      log(`🔴 [FALLBACK] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту в трансформации - помечаем как failed`, 'proxy');
                      proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_FALLBACK_TRANSFORM');
                      
                      // Сбрасываем флаги и пробуем с новым прокси
                      usedProxy = false;
                      currentProxy = null;
                      botProtectionDetected = true;
                      continue;
                    }
                  }
                  
                  throw new Error(`Failed to navigate with all fallback methods (3-stage, 2-stage, transform): ${transformFallbackResponse.error || 'unknown error'}`);
                }
                
                log(`✅ [FALLBACK] Товар загружен через URL трансформацию (статус: ${transformFallbackResponse.status})`, 'success');
              }
              
              // Проверяем куда мы попали после fallback
              const finalUrl = page.url();
              log(`🔍 [FALLBACK] Финальный URL: ${shortenUrl(finalUrl)}`, 'debug');
            } else {
              // ✅ Трехэтапная навигация прошла успешно - теперь переходим на товар
              log(`🎯 [PRODUCT] Переходим на товар: ${shortenUrl(url)}`, 'info');
              
              const productNavigationStart = Date.now();
              const productResponse = await safeNavigate(page, url, { 
                timeout: pageTimeoutMs 
              });
              
              if (!productResponse.success) {
                // Проверяем статус товара после успешной 3-stage навигации
                if (productResponse.status === 403) {
                  log(`🚫 [PRODUCT] HTTP 403 на товаре после 3-stage - регистрируем защиту`, 'warning');
                  botProtectionDetected = true;
                  const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                  
                  if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                    log(`🔒 [PRODUCT] Нужен прокси для товара. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                    continue; // Начинаем новую итерацию с прокси
                  }
                  
                  // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                  if (usedProxy && currentProxy) {
                    log(`🔴 [PRODUCT] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту товара после 3-stage - помечаем как failed`, 'proxy');
                    proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_PRODUCT_AFTER_3STAGE');
                    
                    // Сбрасываем флаги и пробуем с новым прокси
                    usedProxy = false;
                    currentProxy = null;
                    botProtectionDetected = true;
                    continue;
                  }
                }
                
                throw new Error(`Failed to navigate to product page after 3-stage setup: ${productResponse.error || 'unknown error'}`);
              }
              
              const productNavigationTime = Date.now() - productNavigationStart;
              const finalUrl = page.url();
              log(`✅ [PRODUCT] Товар загружен за ${productNavigationTime}ms (статус: ${productResponse.status})`, 'info');
              log(`🔍 [PRODUCT] Финальный URL: ${shortenUrl(finalUrl)}`, 'debug');
            }
          } else {
            // Для других сайтов или при проблемах с city representation - прямой переход
            const shouldUseDirectUrl = hadRedirectLoop || redirectErrorUrls.has(url.split('?')[0]);
            const transformedUrl = shouldUseDirectUrl ? url : transformUrlWithCityRepresentation(url);
            
            // Log the transformation if the URL was changed
            if (transformedUrl !== url) {
              log(`URL transformed for city representation (ID: ${CITY_CONFIG.representId})`, 'info');
              log(`Original: ${url}`, 'debug');
              log(`Transformed: ${transformedUrl}`, 'debug');
            } else if (shouldUseDirectUrl) {
              log(`Using direct URL (skipping city representation) due to previous redirect errors`, 'info');
            }
            
            // Log proxy status if using one
            if (currentProxy) {
              log(`🌐 Using proxy: ${currentProxy.host}:${currentProxy.port} (${currentProxy.country}) for request`, 'proxy');
            }
            
            // Use our safer navigation method
            const navigationSuccess = await safeNavigate(page, transformedUrl, { 
              timeout: pageTimeoutMs 
            });
            
            if (!navigationSuccess.success) {
              // Проверяем статус для других сайтов
              if (navigationSuccess.status === 403) {
                log(`🚫 [OTHER-SITES] HTTP 403 обнаружен - регистрируем защиту`, 'warning');
                botProtectionDetected = true;
                const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                
                if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                  log(`🔒 [OTHER-SITES] Нужен прокси. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                  continue; // Начинаем новую итерацию с прокси
                }
                
                // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                if (usedProxy && currentProxy) {
                  log(`🔴 [OTHER-SITES] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту - помечаем как failed`, 'proxy');
                  proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_OTHER_SITES');
                  
                  // Сбрасываем флаги и пробуем с новым прокси
                  usedProxy = false;
                  currentProxy = null;
                  botProtectionDetected = true;
                  continue;
                }
              }
              
              throw new Error(`Failed to navigate to page: ${navigationSuccess.error || 'unknown error'}`);
            }
            
            log(`✅ [OTHER-SITES] Страница загружена (статус: ${navigationSuccess.status})`, 'info');
          }
          
          // Check for redirect loop errors - in this case, it's the actual chrome redirect error page
          const pageUrl = page.url();
          const pageContent = await page.content();
          if ((pageUrl.includes('chrome-error://') || pageUrl === 'chrome-error://chromewebdata/') && 
               pageContent.includes('ERR_TOO_MANY_REDIRECTS')) {
            log(`🚨 Detected ERR_TOO_MANY_REDIRECTS error from city representation`, 'warning');
            
            // Handle the redirect loop
            hadRedirectLoop = true;
            handleRedirectLoop(url);
            
            // Get direct URL without city representation
            const directUrl = getDirectUrl(url);
            log(`🔄 Retrying with direct URL: ${shortenUrl(directUrl)}`, 'info');
            
            // Clear cookies and retry with direct URL
            await clearCookiesForDomain(page);
            const directNavigationResult = await safeNavigate(page, directUrl, { timeout: pageTimeoutMs });
            
            if (!directNavigationResult.success) {
              // Проверяем статус при прямой навигации
              if (directNavigationResult.status === 403) {
                log(`🚫 [REDIRECT-FIX] HTTP 403 при прямой навигации - регистрируем защиту`, 'warning');
                botProtectionDetected = true;
                const shouldUseProxy = proxyHandler.registerProtectionHit(); 
                
                if (shouldUseProxy && !usedProxy && PROXY_CONFIG.useProxy) {
                  log(`🔒 [REDIRECT-FIX] Нужен прокси для прямой навигации. Total hits: ${proxyHandler.getProtectionHitCount()}`, 'proxy');
                  continue; // Начинаем новую итерацию с прокси
                }
                
                // Если 403 через прокси - помечаем прокси как failed и пробуем следующий
                if (usedProxy && currentProxy) {
                  log(`🔴 [REDIRECT-FIX] Прокси ${currentProxy.host}:${currentProxy.port} не обошел защиту при прямой навигации - помечаем как failed`, 'proxy');
                  proxyHandler.markProxyAsFailed(currentProxy, 'HTTP_403_REDIRECT_FIX');
                  
                  // Сбрасываем флаги и пробуем с новым прокси
                  usedProxy = false;
                  currentProxy = null;
                  botProtectionDetected = true;
                  continue;
                }
              }
              
              throw new Error(`Failed to navigate with direct URL: ${directNavigationResult.error || 'unknown error'}`);
            }
            
            log(`✅ [REDIRECT-FIX] Прямая навигация успешна (статус: ${directNavigationResult.status})`, 'info');
          }
          
          // Measure page size (content weight)
          const pageContentSize = Buffer.byteLength(pageContent || await page.content(), 'utf8');
          totalTrafficBytes += pageContentSize;
          
          log(`📦 Page size: ${formatFileSize(pageContentSize)} | Memory: ${formatFileSize(process.memoryUsage().heapUsed)}`, 'info');
          
          // Wait a bit for dynamic content
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // CRITICAL: Check for bot protection IMMEDIATELY after navigation
          const currentUrl = page.url();
          if (currentUrl.includes('/xpvnsulc/')) {
            log(`🚫 Bot protection detected: URL contains /xpvnsulc/`, 'warning');
            botProtectionDetected = true;
            
            // Register this protection hit with the proxy handler - use the new correct function name
            const shouldUseProxy = proxyHandler.registerProtectionHit();
            // Use getProtectionHitCount instead of getProtectionHits
            log(`🔒 Bot protection registered. Total hits: ${proxyHandler.getProtectionHitCount()}, Should use proxy: ${shouldUseProxy}`, 'proxy');
            
            // If we're already using a proxy and still hit protection, mark it as failed
            if (usedProxy) {
              log(`❌ Proxy ${currentProxy.host}:${currentProxy.port} failed to bypass protection`, 'proxy');
              proxyHandler.registerProxyFailure(currentProxy);
              
              // If we've already tried with a proxy and still getting protection, might need to skip
              if (attempt >= MAX_RETRIES - 1) {
                log(`❌ Maximum retries reached with proxy still failing, skipping product`, 'warning');
                break;
              }
            }
            
            // Skip straight to the next attempt which will use a proxy if needed
            continue;
          }
          
          // *** НОВОЕ УЛУЧШЕННОЕ ИЗВЛЕЧЕНИЕ ДАННЫХ ***
          log(`🔍 [EXTRACTION] Запускаем улучшенное извлечение данных...`, 'info');
          
          // Получаем заголовок страницы для ранней диагностики
          const earlyPageTitle = await page.title();
          log(`📄 [EXTRACTION] Заголовок страницы: "${earlyPageTitle}"`, 'debug');
          
          // Используем новую улучшенную функцию извлечения
          const extractedProductData = await extractProductDataImproved(page, earlyPageTitle);
          
          // Проверяем качество данных
          if (!isDataQualityGood(extractedProductData)) {
            log(`❌ [EXTRACTION] Данные не прошли проверку качества`, 'warning');
            throw new Error('Извлеченные данные не соответствуют требованиям качества');
          }
          
          log(`✅ [EXTRACTION] Успешно извлечены качественные данные`, 'success');
          
          // Переименовываем поля для совместимости с существующей логикой
          const name = extractedProductData.name;
          const price = extractedProductData.price;
          const availability = extractedProductData.availability || 'unavailable';
          const quantity = extractedProductData.quantity || 0;
          const imageUrl = extractedProductData.imageUrl;
          
          log(`📊 [EXTRACTION] Итоговые данные: name="${name}", price=${price}, availability=${availability}, quantity=${quantity}, hasImage=${!!imageUrl}`, 'debug');
          
          // Use enhanced error page detection with context awareness
          const errorCheck = await checkErrorPage(name, page);
          
          if (name && !errorCheck.isError) {
            // Regular successful extraction - no error detected
            extractedData = {
              name,
              currentPrice: price || 0,
              availability,
              quantity,
              originalPhotoUrl: imageUrl,  // *** ДОБАВЛЯЕМ ПОЛЕ ИЗОБРАЖЕНИЯ ***
              sourceUrl: url,
              updatedAt: new Date().toISOString()
            };
            success = true;
            
            // Register successful request with proxy info
            if (usedProxy) {
              log(`✅ Successful extraction with proxy ${currentProxy.host}:${currentProxy.port}`, 'proxy');
              proxyHandler.registerSuccess(usedProxy, currentProxy);
            }
            
            log(`  ✓ Extracted: ${name}, Price: ${price || 'N/A'}, Availability: ${availability}`, 'success');
          } else if (name && errorCheck.isError) {
            // Error page detected, but check if it's temporary
            if (errorCheck.errorType === 'temporary') {
              log(`  ⚠ Detected TEMPORARY error page: "${name}" - trying fast retry`, 'warning');
              continue;
            } else {
              // This is a permanent error page
              log(`  ✗ Detected ${errorCheck.errorType} error page with title "${name}" - treating as failed extraction`, 'warning');
              
              // Set success to false so it won't be saved to database
              success = false;
              
              // Set appropriate error message
              extractedData.error = `Error page detected: "${name}" (${errorCheck.errorType})`;
              
              // If we're using a proxy, still mark it as a technical success (proxy worked)
              if (usedProxy) {
                proxyHandler.registerSuccess(usedProxy, currentProxy);
              }
            }
          } else {
            // No product name found - check for less obvious bot protection
            if (!botProtectionDetected) {
              try {
                // Создаем объект для проверки защиты с доступными данными
                const checkData = { name, currentPrice: price };
                botProtectionDetected = await isBotProtection(page, checkData);
                
                if (botProtectionDetected) {
                  log(`🚫 Bot protection detected through content analysis`, 'warning');
                  const shouldUseProxy = proxyHandler.registerProtectionHit();
                  log(`🔒 Bot protection registered. Should use proxy: ${shouldUseProxy}`, 'proxy');
                  
                  if (usedProxy) {
                    // If we're already using a proxy and still getting protection
                    log(`❌ Proxy failed to bypass protection, marking as failed: ${currentProxy.host}:${currentProxy.port}`, 'proxy');
                    proxyHandler.registerProxyFailure(currentProxy);
                  }
                  
                  // Go to next attempt which will use a proxy if needed
                  continue;
                }
              } catch (botCheckError) {
                log(`Error checking for bot protection: ${botCheckError.message}`, 'error');
              }
            }
            
            // Not bot protection, just failed extraction
            if (usedProxy) {
              proxyHandler.registerProxyFailure(currentProxy);
            }
            log(`  ✗ Failed to extract product data on attempt ${attempt+1}`, 'warning');
          }
        } catch (err) {
          // Improved error handling for proxy issues
          if (usedProxy && (
              err.message.includes('ERR_INVALID_AUTH_CREDENTIALS') ||
              err.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
              err.message.includes('ERR_TUNNEL_CONNECTION_FAILED'))) {
            log(`❌ Proxy error: ${err.message}`, 'proxy');
            
            // Try one more time with a different proxy
            if (attempt < MAX_RETRIES - 1) {
              // Get a new proxy
              log(`🔄 Getting a new proxy after error...`, 'proxy');
              currentProxy = await proxyHandler.getNextWorkingProxy();
              
              if (currentProxy) {
                log(`✅ Switching to new proxy: ${currentProxy.host}:${currentProxy.port}`, 'proxy');
                
                // Close current resources
                await page.close().catch(e => log(`Error closing page: ${e.message}`, 'debug'));
                await localBrowser.close().catch(e => log(`Error closing browser: ${e.message}`, 'debug'));
                
                // Create new browser with new proxy
                localBrowser = await createBrowser(headless, currentProxy);
                page = await localBrowser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
                
                // Update flags
                usedProxy = true;
                
                // Continue to next attempt
                continue;
              }
            }
          }
          
          extractedData.error = err.message;
          log(`  ✗ Error on attempt ${attempt+1}: ${err.message}`, 'error');
          
          if (usedProxy) {
            proxyHandler.registerProxyFailure(currentProxy);
          }
        }
      }
      
      // Close the page to free up resources
      try {
        if (isPageValid(page)) {
          await page.close().catch(e => log(`Non-fatal error closing page: ${e.message}`, 'warning'));
        }
      } catch (closeError) {
        log(`Error when closing page: ${closeError.message}`, 'warning');
        // Continue execution despite page close errors
      }
      
      // End metrics tracking for this request
      const requestResult = metrics.endRequest(requestMetrics, success, botProtectionDetected);
      
      // Log memory usage more prominently
      const memoryUsed = requestResult.memoryDiff.heapUsed.toFixed(2);
      const memoryIcon = memoryUsed > 5 ? '⚠️' : (memoryUsed > 0 ? '✅' : '❌');
      log(`${memoryIcon} Memory change: ${memoryUsed} MB (Heap) | Total traffic: ${formatFileSize(totalTrafficBytes)}`, 'info');
      
      // Save result for return value
      results.push({
        id,
        name: extractedData.name || name,
        url,
        isCompetitor,
        competitorIndex,
        data: extractedData,
        success,
        botProtectionDetected,
        usedProxy
      });
      
      // Update database with extracted data if successful
      if (success) {
        try {
          // Double-check this isn't an error page before updating database
          if (extractedData.name && isErrorPage(extractedData.name)) {
            log(`⛔ Prevented database update for error page: "${extractedData.name}"`, 'warning');
            success = false;
          } else {
            log(`Updating database for ${isCompetitor ? 'competitor' : 'product'} ID: ${id}`, 'db');
            await updateProductInDatabase(
              id, 
              extractedData, 
              isCompetitor, 
              competitorIndex, 
              ProductModel
            );
            log(`  ✓ Database updated successfully`, 'success');
          }
        } catch (dbError) {
          log(`  ✗ Error updating database: ${dbError.message}`, 'error');
        }
      }
      
      // Print proxy and metrics statistics every 10 products or on last product
      if (i % 10 === 0 || i === productsToScrape.length - 1) {
        proxyHandler.printStats();
        metrics.logMetrics();
      }
      
      // Add longer delay between products to avoid being rate-limited
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Improve browser closing with error handling
    try {
      if (localBrowser && localBrowser.isConnected()) {
        await localBrowser.close().catch(e => log(`Non-fatal error closing browser: ${e.message}`, 'warning'));
        log(`Browser closed`, 'info');
      }
    } catch (browserCloseError) {
      log(`Error when closing browser: ${browserCloseError.message}`, 'warning');
    }
    
    // Close database connection
    await closeDatabaseConnection();
    log(`Database connection closed`, 'info');
    
    log(`Done! Processed ${results.length} products/competitors`, 'success');
    
    return results;
  } catch (error) {
    log(`Fatal error in processProducts: ${error.message}`, 'error');
    throw error;
  }
};

/**
 * Format elapsed time in ms to a human-readable string
 * @param {number} ms - Time in milliseconds
 * @returns {string} - Human-readable format
 */
const formatElapsedTime = (ms) => {
  if (ms === 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Format time in ms to a concise human-readable string
 * @param {number} ms - Time in milliseconds
 * @returns {string} - Concise human-readable format
 */
const formatTime = (ms) => {
  if (ms === 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

/**
 * Format file size to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Human-readable file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Update the isPageValid function to properly check if a page is valid before closing
 * @param {Object} page - Puppeteer page object
 * @returns {boolean} - True if the page is valid and can be closed
 */
const isPageValid = (page) => {
  if (!page) return false;
  
  // Try multiple methods to check if page is valid
  try {
    // First check if the page has a browser
    if (!page.browser()) return false;
    
    // Check if isClosed method exists (newer Puppeteer versions)
    if (typeof page.isClosed === 'function') {
      return !page.isClosed();
    }
    
    // Fallback to a simple property check for older versions
    return !!page._client;
  } catch (e) {
    // If any error occurs during checks, page is invalid
    return false;
  }
};

/**
 * Функция для проверки качества извлеченных данных - УЛУЧШЕННАЯ ВЕРСИЯ
 * @param {Object} productData - Извлеченные данные продукта
 * @returns {boolean} - True если качество данных хорошее
 */
const isDataQualityGood = (productData) => {
  if (!productData) {
    log('❌ Качество данных: отсутствуют данные', 'debug');
    return false;
  }
  
  const { name, currentPrice, imageUrl, quantity, originalPhotoUrl } = productData;
  
  // Обязательные поля
  if (!name || name.length < 5) {
    log(`❌ Качество данных: некорректное название "${name}"`, 'debug');
    return false;
  }
  
  // Проверяем что название не является навигационным элементом или главной страницей
  const invalidNames = ['главная', 'home', 'каталог', 'catalog', 'меню', 'menu'];
  const isMainPageTitle = name.includes('ВсеИнструменты.ру - онлайн-гипермаркет') || 
                         name.includes('для профессионалов и бизнеса') ||
                         name === 'ВсеИнструменты.ру';
  
  if (invalidNames.some(invalid => name.toLowerCase().includes(invalid)) || isMainPageTitle) {
    log(`❌ Качество данных: название является главной страницей или навигацией "${name}"`, 'debug');
    return false;
  }
  
  // Желательно иметь хотя бы цену, изображение, или количество
  const hasPrice = currentPrice && currentPrice > 0;
  const hasImage = (imageUrl && imageUrl.length > 10) || (originalPhotoUrl && originalPhotoUrl.length > 10);
  const hasQuantity = quantity !== null && quantity !== undefined;
  
  const scoreCount = [hasPrice, hasImage, hasQuantity].filter(Boolean).length;
  
  // *** УСИЛЕННЫЕ ТРЕБОВАНИЯ: Если мало данных, возможно мы на неправильной странице ***
  if (scoreCount >= 2) {
    log(`✅ Качество данных: отличное (название + ${scoreCount} дополнительных полей)`, 'debug');
    return true;
  } else if (scoreCount === 1) {
    log(`⚠️ Качество данных: среднее (название + ${scoreCount} поле) - возможно редирект`, 'debug');
    return false; // Теперь требуем минимум 2 поля
  } else {
    log(`❌ Качество данных: плохое (только название) - вероятно редирект на главную`, 'debug');
    return false;
  }
};

/**
 * Checks if the extracted product name indicates an error page
 * @param {string} name - The extracted product name
 * @returns {boolean} - True if the name indicates an error page
 */
const isErrorPage = (name) => {
  if (!name) return false;
  
  const errorMessages = [
    "this page isn't working",
    "this page isn't available",
    "page not found",
    "404",
    "error",
    "sorry",
    "not available",
    "страница не работает",
    "страница недоступна",
    "страница не найдена"
  ];
  
  // Convert to lowercase for case-insensitive matching
  const lowerName = name.toLowerCase();
  
  // Check if the name contains any error message
  return errorMessages.some(msg => lowerName.includes(msg));
};

// Add a helper function to update proxy display
const getProxyStatusDisplay = (proxy, proxyHandler) => {
  if (!proxy) return '';
  
  const proxyKey = `${proxy.host}:${proxy.port}`;
  const stats = proxyHandler.getProxyStats(proxyKey);
  
  if (!stats) return `🔄 Current proxy: ${getCountryEmoji(proxy.country)} ${proxy.host}:${proxy.port} (New)`;
  
  const successRate = stats.uses > 0 ? (stats.successes / stats.uses * 100).toFixed(1) : 0;
  const statusEmoji = successRate >= 70 ? '🟢' : (successRate >= 40 ? '🟡' : '🔴');
  
  return `${statusEmoji} Active proxy: ${getCountryEmoji(proxy.country)} ${proxy.host}:${proxy.port} | ${stats.uses} total uses (${stats.successes}✓/${stats.failures}✗) | Success rate: ${successRate}%`;
};

// Command line interface
const run = async () => {
  try {
    log('Starting scraper...', 'info');
    
    const args = process.argv.slice(2);
    const showBrowser = args.includes('--show-browser') || args.includes('-v');
    
    // Extract limit argument if present
    let limit = 0;
    const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
    if (limitIndex !== -1 && args.length > limitIndex + 1) {
      limit = parseInt(args[limitIndex + 1], 10) || 0;
    }
    
    // Check if a specific city ID was provided
    const cityIndex = args.findIndex(arg => arg === '--city' || arg === '-c');
    if (cityIndex !== -1 && args.length > cityIndex + 1) {
      const cityId = parseInt(args[cityIndex + 1], 10);
      if (!isNaN(cityId)) {
        CITY_CONFIG.representId = cityId;
        log(`Using city representation ID: ${cityId}`, 'info');
      }
    }
    
    // Check if city representation should be disabled
    if (args.includes('--no-city')) {
      CITY_CONFIG.enabled = false;
      log('City representation disabled', 'info');
    }
    
    // Check if we should use proxies from the start
    const forceProxy = args.includes('--proxy') || args.includes('-p');
    if (forceProxy) {
      useProxies = true;
      log('Proxy usage enabled from start via command line argument', 'proxy');
    }
    
    log(`Browser mode: ${showBrowser ? 'visible' : 'headless'}`, 'info');
    log(`Product limit: ${limit > 0 ? limit : 'none (processing all)'}`, 'info');
    
    let results;
    try {
      // БЕЗОПАСНЫЙ TIMEOUT: 30 минут максимум
      const SCRIPT_TIMEOUT = 30 * 60 * 1000; // 30 минут
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT: Скрипт работает дольше 30 минут')), SCRIPT_TIMEOUT);
      });
      
      results = await Promise.race([
        processProducts(!showBrowser, limit),
        timeoutPromise
      ]);
      log(`Scraping completed with ${results.filter(r => r.success).length} successful extractions out of ${results.length} attempts`, 'success');
    } catch (processingError) {
      log(`Error during processing: ${processingError.message}`, 'error');
      log('Continuing script execution despite processing error', 'warning');
      results = [];
    }
    
    // Additional cleanup to ensure resources are released
    try {
      if (isDatabaseConnected()) {
        await closeDatabaseConnection();
      }
    } catch (dbCloseError) {
      log(`Non-fatal error closing database: ${dbCloseError.message}`, 'warning');
    }
    
  } catch (error) {
    log(`Error in run function: ${error.message}`, 'error');
    // Don't exit process, just log the error
    log('Script will continue execution despite errors', 'warning');
  }
};

// Run if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  log('Starting execution as main module', 'info');
  run().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
} else {
  log('Module imported, not running main function', 'info');
}

// Export functions for potential reuse
export {
  processProducts,
  fetchProductsFromDatabase
};
