const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Activar plugin de evasión
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  //Intentará 3 veces
  const MAX_INTENTOS = 3;
  let exito = false;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const page = await browser.newPage();
    console.log(`🔄 Intento ${intento} de ${MAX_INTENTOS}...`);

    try {
      await page.goto('https://www.crunchyroll.com/es/simulcastcalendar?filter=premium', {
        waitUntil: 'networkidle0',
        timeout: 180000 //Espera 3 minutos a que cargue
      });

      await page.waitForSelector('li.day.active.today', { timeout: 120000 });

      const content = await page.content();
      fs.writeFileSync('simulcast.html', content);
      console.log('✅ HTML guardado como simulcast.html');
      exito = true;
      await page.close();
      break;

    } catch (error) {
      //Contador de fallos
      console.log(`⚠️ Falló el intento ${intento}.`);
      await page.close();
    }
  }

  if (!exito) {
    //Si los 3 intentos falla, crea el archivo vacio
    fs.writeFileSync('simulcast.html', '');
    console.log('❌ No se pudo cargar después de 3 intentos. Archivo vacío generado.');
  }

  await browser.close();
})();
