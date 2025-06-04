import { USER_AGENTS } from './config.js';

// Get a random user agent from the list
export const getRandomUserAgent = () => {
  const randomIndex = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[randomIndex];
};

// Get a random delay within a range
export const getRandomDelay = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Create a random pattern of delay for humanlike scrolling
export const generateScrollingPattern = (scrollDistance, steps = 10) => {
  const pattern = [];
  let remainingDistance = scrollDistance;
  
  for (let i = 0; i < steps - 1; i++) {
    // Scrolling speed starts slow, increases in the middle, then slows down again
    const factor = Math.sin((i / (steps - 1)) * Math.PI);
    const stepDistance = Math.floor(remainingDistance * factor / (steps / 2));
    
    pattern.push({
      distance: stepDistance,
      delay: getRandomDelay(50, 200)
    });
    
    remainingDistance -= stepDistance;
  }
  
  // Add the remaining distance as the last step
  pattern.push({
    distance: remainingDistance,
    delay: getRandomDelay(50, 200)
  });
  
  return pattern;
};

/**
 * Scroll the page in a human-like manner to load lazy-loaded content
 * @param {Object} page - Puppeteer page object
 */
export const scrollPageLikeHuman = async (page) => {
  console.log('Scrolling page to load lazy content...');
  
  await page.evaluate(async () => {
    // Get page height
    const pageHeight = document.body.scrollHeight;
    
    // Scroll with random pauses to simulate human behavior
    const scrollStep = Math.floor(Math.random() * 100) + 100; // Random step between 100-200px
    const scrollDelay = () => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 300) + 100));
    
    let currentPosition = 0;
    while (currentPosition < pageHeight) {
      currentPosition += scrollStep;
      window.scrollTo(0, currentPosition);
      await scrollDelay();
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
  });
  
  // Wait for any lazy-loaded content to appear
  await page.waitForTimeout(1000);
};

// Simulate human-like typing (with variable speed and occasional mistakes)
export const typeHumanLike = async (page, selector, text, options = {}) => {
  const defaults = {
    delay: { min: 50, max: 150 },
    mistakeProbability: 0.05,
    focusSelector: true
  };
  
  const settings = { ...defaults, ...options };
  
  try {
    // First click/focus on the element
    if (settings.focusSelector) {
      await page.click(selector);
    }
    
    for (let i = 0; i < text.length; i++) {
      // Random delay between keystrokes
      const delay = getRandomDelay(settings.delay.min, settings.delay.max);
      await page.waitForTimeout(delay);
      
      // Determine if we'll make a typo
      if (Math.random() < settings.mistakeProbability) {
        // Type a random wrong character
        const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        await page.type(selector, randomChar);
        
        // Short delay before correction
        await page.waitForTimeout(getRandomDelay(200, 400));
        
        // Delete the wrong character
        await page.keyboard.press('Backspace');
        
        // Delay again before typing the correct character
        await page.waitForTimeout(getRandomDelay(100, 300));
      }
      
      // Type the correct character
      await page.type(selector, text[i]);
    }
    
    return true;
  } catch (error) {
    console.error(`Error typing text: ${error.message}`);
    return false;
  }
};

// Extract domain name from URL
export const extractDomain = (url) => {
  try {
    const domain = new URL(url).hostname;
    return domain;
  } catch (error) {
    return 'unknown-domain';
  }
};

// Generate random string (useful for filenames, etc.)
export const randomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Safely parse JSON with fallback
export const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    return fallback;
  }
};

// Format file size
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default {
  getRandomUserAgent,
  getRandomDelay,
  generateScrollingPattern,
  scrollPageLikeHuman,
  typeHumanLike,
  extractDomain,
  randomString,
  safeJsonParse,
  formatFileSize
};
