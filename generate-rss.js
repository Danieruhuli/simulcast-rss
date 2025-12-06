const fs = require('fs');
const { JSDOM } = require('jsdom');

// Lee el HTML renderizado previamente
const html = fs.readFileSync('simulcast.html', 'utf-8');

// 🔍 Validación: si está vacío, terminar sin hacer nada
if (!html.trim()) {
  console.log('⚠️ simulcast.html está vacío. No se generará ningún RSS.');
  process.exit(0); // Salida limpia, sin error
}

const dom = new JSDOM(html);
const document = dom.window.document;

// Encuentra todos los <article.release> en cualquier día
const releases = document.querySelectorAll('article.release');

// Extrae la información de cada episodio
const items = Array.from(releases).map(release => {
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
    //cambiamos el id ya que el groupId ha dejado de ser en su mayoria por idioma y va más por serie
    //guid: `${groupId}-${episodeNum}`
    guid: link.replace('https://www.crunchyroll.com/es/watch/', '')
  };
});

// Ordena los episodios del más reciente al más antiguo
const sortedItems = items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

// Genera el contenido del archivo RSS
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

// Crea la carpeta docs si no existe y guarda el archivo XML
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/simulcast-rss.xml', rss);
console.log('✅ RSS generado: simulcast-rss.xml');
