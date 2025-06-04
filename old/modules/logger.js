import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'scraper.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log levels with corresponding colors and prefixes
const LOG_LEVELS = {
  debug: { color: '\x1b[36m', prefix: '[DEBUG]', write: true },
  info: { color: '\x1b[32m', prefix: '[INFO]', write: true },
  warning: { color: '\x1b[33m', prefix: '[WARNING]', write: true },
  error: { color: '\x1b[31m', prefix: '[ERROR]', write: true },
  success: { color: '\x1b[32m', prefix: '[SUCCESS]', write: true },
  db: { color: '\x1b[35m', prefix: '[DATABASE]', write: true },
  proxy: { color: '\x1b[34m', prefix: '[PROXY]', write: true },
  scrape: { color: '\x1b[36m', prefix: '[SCRAPE]', write: true }
};

// Reset color code
const RESET_COLOR = '\x1b[0m';

// Function to format log message with timestamp
const formatLogMessage = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const logLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
  return `${timestamp} ${logLevel.prefix} ${message}`;
};

// Main log function
export const log = (message, level = 'info', skipConsole = false) => {
  if (!message) return;
  
  const logLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
  const formattedMessage = formatLogMessage(message, level);
  
  // Console output with color
  if (!skipConsole) {
    console.log(`${logLevel.color}${formattedMessage}${RESET_COLOR}`);
  }
  
  // File output (without color codes)
  if (logLevel.write) {
    fs.appendFileSync(LOG_FILE, `${formattedMessage}\n`);
  }
};

// Override console methods to capture logs to file
export const setupLogger = () => {
  // Save original console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;
  
  // Override console.log
  console.log = function(...args) {
    // Call original function
    originalConsoleLog.apply(console, args);
    
    // Convert args to string and log to file
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    // Don't log empty messages or very long messages
    if (message && message.length > 0 && message.length < 2000) {
      // Skip common noisy logs
      if (!message.includes('EXISTING DOC FIELDS') && 
          !message.includes('API Response:') &&
          !message.startsWith('  ')) {
        log(message, 'info', true);
      }
    }
  };
  
  // Override console.error
  console.error = function(...args) {
    // Call original function
    originalConsoleError.apply(console, args);
    
    // Convert args to string and log to file
    const message = args.map(arg => 
      typeof arg === 'object' && arg instanceof Error ? `${arg.name}: ${arg.message}` :
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    if (message && message.length > 0) {
      log(message, 'error', true);
    }
  };
  
  // Override console.warn
  console.warn = function(...args) {
    // Call original function
    originalConsoleWarn.apply(console, args);
    
    // Convert args to string and log to file
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    if (message && message.length > 0) {
      log(message, 'warning', true);
    }
  };
  
  // Override console.info
  console.info = function(...args) {
    // Call original function
    originalConsoleInfo.apply(console, args);
    
    // Convert args to string and log to file
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    if (message && message.length > 0) {
      log(message, 'info', true);
    }
  };
  
  log('Logger initialized - console output will be captured to logs/scraper.log', 'info');
  return { log };
};

export default {
  log,
  setupLogger
};
