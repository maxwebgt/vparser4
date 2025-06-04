import { chromium } from 'playwright';

console.log('🔧 ТЕСТ СЕТЕВОГО СОЕДИНЕНИЯ\n');

const testNetwork = async () => {
  console.log('1. Тестируем DNS...');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Тест 1: Простой сайт
  try {
    console.log('2. Загружаем Google...');
    const googleResponse = await page.goto('https://www.google.com', { timeout: 10000 });
    console.log(`✅ Google: ${googleResponse.status()}`);
  } catch (error) {
    console.log(`❌ Google error: ${error.message}`);
  }
  
  // Тест 2: Целевой сайт
  try {
    console.log('3. Загружаем vseinstrumenti.ru...');
    const targetResponse = await page.goto('https://www.vseinstrumenti.ru/', { timeout: 10000 });
    console.log(`✅ Vseinstrumenti: ${targetResponse.status()}`);
    console.log('Headers:', targetResponse.headers());
    
    const title = await page.title();
    console.log('Title:', title);
  } catch (error) {
    console.log(`❌ Vseinstrumenti error: ${error.message}`);
  }
  
  await browser.close();
};

await testNetwork();
console.log('🏁 Тест завершен!'); 