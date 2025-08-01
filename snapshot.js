const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.crunchyroll.com/es/simulcastcalendar?filter=premium', { waitUntil: 'networkidle' });

  const content = await page.content();
  fs.writeFileSync('simulcast.html', content);

  await browser.close();
})();
