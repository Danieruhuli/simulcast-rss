const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Activar evasión
puppeteer.use(StealthPlugin());

const targets = [
  /*
  URL anterior, se retira en 2026-10-28 debido a actualizaciòn en el sitio
  por la nueva verrsión de PHP
  {
    url: 'https://www.crunchyroll.com/es/simulcastcalendar?filter=premium',
    output: 'simulcast.html',
  },
  */
  {
    url: 'https://www.crunchyroll.com/es/releasecalendar',
    output: 'simulcast.html',
  },
  {
    url: 'https://mangaplus.shueisha.co.jp/updates',
    output: 'simulpub-mangaplus.html',
  },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let failedCount = 0;

  for (const target of targets) {
    const page = await browser.newPage();

    try {
      console.log(`⏳ Cargando ${target.url}...`);
      await page.goto(target.url, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });

      const content = await page.content();
      fs.writeFileSync(target.output, content);
      console.log(`✅ Guardado: ${target.output}`);
    } catch (err) {
      console.error(`❌ Error en ${target.url}:`, err.message);
      fs.writeFileSync(target.output, ''); // HTML vacío
      failedCount++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  if (failedCount === targets.length) {
    console.error('🛑 Todas las páginas fallaron. Abortando con código de error.');
    process.exit(1);
  } else {
    console.log('🏁 Proceso terminado. Algunas páginas pueden haber fallado.');
    process.exit(0);
  }
})();