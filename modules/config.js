/**
 * Common user agents for more realistic browsing behavior
 */
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0'
];

/**
 * Proxy configuration
 */
export const PROXY_CONFIG = {
  useProxy: true,
  apiKey: 'qf8q4w-s8r6rk-h6y8yd-6kq5k6-6xb9pkf', // WebShare API key
  switchProxyAfterFailures: 3,
  testBeforeUse: true,
  testUrls: [
    'https://example.org',
    'https://httpbin.org/ip'
  ],
  rotationStrategy: 'random' // 'random' or 'sequential'
};

/**
 * Scraper configuration
 */
export const SCRAPER = {
  retries: 3,
  concurrency: 1,
  delay: {
    min: 2000,
    max: 5000
  },
  timeout: {
    page: 60000,
    selector: 10000
  },
  browser: {
    headless: true,
    dumpio: true,
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
      '--force-device-scale-factor=1',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      '--disable-system-sounds',
      '--disable-notifications',
      '--disable-background-networking',
      '--disable-translate',
      '--disable-speech-api',
      '--disable-web-bluetooth',
      '--disable-reading-from-canvas',
      '--disable-3d-apis',
      '--disable-video-capture-service',
      '--disable-media-stream',
      '--disable-webrtc',
      '--disable-camera',
      '--disable-microphone',
      '--disable-webgl',
      '--disable-webgl2',
      '--disable-accelerated-video-decode',
      '--disable-accelerated-video-encode',
      '--disable-audio-output',
      '--mute-audio',
      '--disable-login-animations',
      '--disable-modal-animations',
      '--disable-search-geolocation-disclosure',
      '--disable-domain-reliability',
      '--disable-component-update',
      '--disable-client-side-phishing-detection',
      '--disable-process-per-site',
      '--process-per-tab',
      '--silent-debugger-extension-api',
      '--disable-extensions-except',
      '--log-level=1',
      '--lang=ru-RU,ru',
      '--accept-lang=ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    ]
  }
};

/**
 * Target URLs for parsing
 */
export const TARGET_URLS = [
  'https://www.vseinstrumenti.ru/instrument/svarochnoe-oborudovanie/invertornyj-apparat/orion/varta-200-prof/',
  'https://www.vseinstrumenti.ru/instrument/elektro/perforatory/metabo/khe-2650/',
  'https://www.vseinstrumenti.ru/instrument/elektro/bolgarki/bosch/gws-15-150-cih/'
];

export default {
  USER_AGENTS,
  SCRAPER,
  PROXY_CONFIG,
  TARGET_URLS
}; 