/**
 * Simple logger for proxy module
 */
export const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const levelEmojis = {
    'info': 'ℹ️',
    'success': '✅',
    'warning': '⚠️',
    'error': '❌',
    'debug': '🔍',
    'proxy': '🌐'
  };
  
  const emoji = levelEmojis[level] || 'ℹ️';
  console.log(`${timestamp} ${emoji} [${level.toUpperCase()}] ${message}`);
};

export default { log }; 