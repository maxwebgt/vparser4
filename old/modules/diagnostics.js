import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

/**
 * Save diagnostic information for debugging purposes
 * @param {Object} page - Puppeteer page object
 * @param {string} url - URL of the page
 * @param {string} errorDir - Directory to save error files
 * @returns {Promise<string>} - Path to the saved file
 */
export const saveDiagnostics = async (page, url, errorDir) => {
  try {
    // Ensure the error directory exists
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
      log(`Created error directory: ${errorDir}`, 'info');
    }
    
    // Generate a timestamp for unique filenames
    const timestamp = Date.now();
    
    // Try to get a safe filename from the URL
    let filename = 'unknown';
    try {
      const urlObj = new URL(url);
      filename = urlObj.hostname.replace(/\./g, '_') + urlObj.pathname.replace(/[\/\\?%*:|"<>]/g, '_');
    } catch (e) {
      log(`Could not parse URL for filename: ${e.message}`, 'warn');
      filename = 'unknown_page';
    }
    
    // Truncate if too long
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }
    
    // Add timestamp to make it unique
    filename = `${filename}_${timestamp}`;
    
    // Save screenshot
    const screenshotPath = path.join(errorDir, `${filename}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`Saved error screenshot to: ${screenshotPath}`, 'info');
    } catch (screenshotErr) {
      log(`Failed to save screenshot: ${screenshotErr.message}`, 'error');
    }
    
    // Save HTML
    const htmlPath = path.join(errorDir, `${filename}.html`);
    try {
      const html = await page.content();
      fs.writeFileSync(htmlPath, html);
      log(`Saved error HTML to: ${htmlPath}`, 'info');
    } catch (htmlErr) {
      log(`Failed to save HTML: ${htmlErr.message}`, 'error');
    }
    
    return htmlPath;
  } catch (error) {
    log(`Error saving diagnostics: ${error.message}`, 'error');
    return 'Error saving diagnostics';
  }
};

export default {
  saveDiagnostics
};
