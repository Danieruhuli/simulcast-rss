const fs = require('fs');
const { JSDOM } = require('jsdom');
const xml2js = require('xml2js');

// -----------------------------------------------------
// 1) Función: cargar previous RSS con 3 reintentos
// -----------------------------------------------------
async function loadPreviousItemsWithRetry(filePath) {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const xml = await fs.promises.readFile(filePath, "utf8");
      const parsed = await xml2js.parseStringPromise(xml);

      const rawItems = parsed.rss.channel[0].item || [];

      const previousItems = rawItems.map(item => {
        const title = item.title?.[0] || "";
        const link = item.link?.[0] || "";
        const guid = item.guid?.[0]._ || item.guid?.[0] || "";
        const pubDate = item.pubDate?.[0] || "";

        const descRaw = item.description?.[0] || "";

        // Extraer <img src="...">
        const imageMatch = descRaw.match(/<img src="([^"]+)"/);
        const image = imageMatch ? imageMatch[1] : "";

        // Dejar la descripción limpia, sin la imagen
        const cleanedDescription = descRaw
          .replace(/<img[^>]*>/, "")
          .replace(/<br\/?>/g, "")
          .trim();

        return {
          title,
          link,
          pubDate,
          description: cleanedDescription,
          image,
          guid
        };
      });

      
      console.log(`⏪ Se encontró RSS anterior con ${previousItems.length} elementos.`);
      if (previousItems.length > 0) {
         console.log(`📅 Último pubDate ya registrado: ${previousItems[0].pubDate}`);
      } 
      return previousItems;
    } catch (err) {
      console.error(`Error al parsear previous RSS (intento ${attempt} de 3):`, err);
      if (attempt === maxRetries) {
        console.warn("❗ No se pudo cargar previous RSS. Se usará previousItems = []");
        return [];
      }
      await new Promise(res => setTimeout(res, 1000));
    }
  }
}

// -----------------------------------------------------
// 2) Cargar el HTML renderizado
// -----------------------------------------------------

const html = fs.readFileSync('simulcast.html', 'utf-8');

if (!html.trim()) {
  console.log('⚠️ simulcast.html está vacío. No se generará ningún RSS.');
  process.exit(0);
}

const dom = new JSDOM(html);
const document = dom.window.document;

// -----------------------------------------------------
// 3) Extraer nuevos items de Crunchyroll
// -----------------------------------------------------

const releases = document.querySelectorAll('article.release');

const newItems = Array.from(releases).map(release => {
  const seasonTitle = release.querySelector('h1.season-name cite')?.textContent.trim() || '';
  const episodeTitle = release.querySelector('h1.episode-name cite')?.textContent.trim() || '';
  const link = release.querySelector('a.available-episode-link')?.href || '';
  const pubDate = release.querySelector('meta[itemprop="datePublished"]')?.content || new Date().toISOString();
  const descriptionTime = release.querySelector('.available-time')?.textContent.trim() || '';
  const thumbnail = release.querySelector('img.thumbnail')?.src || '';
  const groupId = release.getAttribute('data-group-id') || '';
  const episodeNum = release.getAttribute('data-episode-num') || '';
  const episodeLabel = release.querySelector('.episode-label')?.textContent.trim() || '';
  const episodeLinkText = release.querySelector('a.available-episode-link')?.textContent.trim().replace(/\s+/g, ' ') || '';

  return {
    title: `${seasonTitle} - Episodio ${episodeLabel} - ${episodeTitle}`,
    link,
    pubDate: new Date(pubDate).toUTCString(),
    description: `${episodeLinkText} - ${episodeTitle}`,
    image: thumbnail,
    guid: link.replace('https://www.crunchyroll.com/es/watch/', '')
  };
});

  
  if (newItems.length > 0) {
      console.log(`🆕 Se encontraron ${newItems.length} elementos para validar.`);
  } 



// -----------------------------------------------------
// 4) Cargar previous RSS (si existe) y unir sin duplicados
// -----------------------------------------------------

async function main() {
  const rssFile = 'docs/simulcast-rss.xml';

  let previousItems = [];

  if (fs.existsSync(rssFile)) {
    previousItems = await loadPreviousItemsWithRetry(rssFile);
  }

  // Mezclar nuevos + previos sin duplicados por GUID
  const combined = [...newItems, ...previousItems];
  const uniqueByGuid = Array.from(
    new Map(combined.map(item => [item.guid, item]))
  ).map(entry => entry[1]);

  // Ordenar del más nuevo al más viejo
  const merged = uniqueByGuid.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  console.log(`📋 Total final de elementos sin duplicados: ${merged.length}`);
  if(merged.length>70){
    console.log(`✂️  El total será limitado a 70 elementos`);
  }

  //Tamaño máximo, 70 registros
  const sortedItems = merged.slice(0, 70);
  // -----------------------------------------------------
  // 5) Generar RSS final
  // -----------------------------------------------------

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Los Últimos Videos de Crunchyroll</title>
  <link>https://www.crunchyroll.com/es/simulcastcalendar</link>
  <description>Lista RSS de estrenos en Crunchyroll</description>
  <language>es</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${sortedItems.map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="false">${item.guid}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description><![CDATA[<img src="${item.image}" /><br/>${item.description}]]></description>
    </item>
  `).join('\n')}
</channel>
</rss>`;

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(rssFile, rss);

  console.log('✅ RSS generado: simulcast-rss.xml');
}

main();
