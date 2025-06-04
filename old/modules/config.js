/**
 * Common user agents for more realistic browsing behavior
 */
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:97.0) Gecko/20100101 Firefox/97.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:96.0) Gecko/20100101 Firefox/96.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
];

/**
 * Database configuration
 */
export const DATABASE = {
  uri: process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/vetg?authSource=admin',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000
  }
};

/**
 * Proxy configuration
 */
export const PROXY_CONFIG = {
  useProxy: true,
  apiKey: 'qf8qedpyxethbo8qjdhiol5r4js7lm8jmcs59pkf',
  switchProxyAfterFailures: 3,
  testBeforeUse: true,
  testUrls: [
    'https://example.org',
    'https://httpbin.org/ip'
  ]
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
  }
};

export default {
  USER_AGENTS,
  DATABASE,
  SCRAPER,
  PROXY_CONFIG
};
