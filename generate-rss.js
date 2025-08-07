const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');

// Ruta del archivo RSS de salida
const RSS_PATH = 'docs/simulcast-rss.xml';

// Lee el HTML renderizado previamente
const html = fs.readFileSync('simulcast.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

// Encuentra todos los <article.release> en cualquier día
const releases = document.querySelectorAll('article.release');

// Extrae la información de cada episodio
const itemsFromHTML = Array.from(releases).map(release => {
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
    guid: `${groupId}-${episodeNum}`
  };
});

// Ordena los episodios del más reciente al más antiguo
const sortedNewItems = itemsFromHTML.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

// Si el archivo RSS no existe, crearlo desde cero
if (!fs.existsSync(RSS_PATH)) {
  const rss = generateRSS(sortedNewItems);
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(RSS_PATH, rss);
  console.log('✅ RSS generado desde cero: simulcast-rss.xml');
} else {
  // Si ya existe, cargar los ítems actuales
  const oldRSS = fs.readFileSync(RSS_PATH, 'utf-8');
  const oldItems = extractItemsFromRSS(oldRSS);

  // Crear un mapa de GUIDs existentes
  const existingGuids = new Set(oldItems.map(item => item.guid));

  // Filtrar los ítems nuevos que no estén en el RSS existente
  const newUniqueItems = sortedNewItems.filter(item => !existingGuids.has(item.guid));

  // Combinar y volver a ordenar
  const combinedItems = [...newUniqueItems, ...oldItems].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Limitar a los 100 más recientes
  const finalItems = combinedItems.slice(0, 100);

  // Generar el RSS final
  const updatedRSS = generateRSS(finalItems);
  fs.writeFileSync(RSS_PATH, updatedRSS);
  console.log(`🔁 RSS actualizado con ${newUniqueItems.length} nuevo(s) registro(s). Total: ${finalItems.length}`);
}

// Función que genera el XML completo de RSS
function generateRSS(items) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Los Últimos Videos de Crunchyroll</title>
  <link>https://www.crunchyroll.com/es/simulcastcalendar</link>
  <description>Lista RSS de estrenos en Crunchyroll</description>
  <language>es</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items.map(item => `
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
}

// Función para extraer ítems desde un RSS XML existente
function extractItemsFromRSS(rss) {
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  const guidRegex = /<guid[^>]*>(.*?)<\/guid>/;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/;
  const linkRegex = /<link>(.*?)<\/link>/;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
  const descriptionRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/;

  const matches = rss.match(itemRegex) || [];
  return matches.map(itemXml => {
    return {
      title: (titleRegex.exec(itemXml) || [])[1] || '',
      link: (linkRegex.exec(itemXml) || [])[1] || '',
      guid: (guidRegex.exec(itemXml) || [])[1] || '',
      pubDate: (pubDateRegex.exec(itemXml) || [])[1] || '',
      description: (descriptionRegex.exec(itemXml) || [])[1] || '',
      image: extractImageFromDescription((descriptionRegex.exec(itemXml) || [])[1] || '')
    };
  });
}

// Extrae la URL de la imagen desde la descripción
function extractImageFromDescription(desc) {
  const imgMatch = desc.match(/<img src="(.*?)"/);
  return imgMatch ? imgMatch[1] : '';
}
