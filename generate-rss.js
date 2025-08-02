const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('simulcast.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

// Encuentra el contenedor del día actual
const today = document.querySelector('li.day.active.today');
if (!today) {
  console.error('No se encontró el día actual en el HTML');
  process.exit(1);
}

// Encuentra los elementos <article> dentro del día actual
const releases = today.querySelectorAll('article.release');

const items = Array.from(releases).map(release => {
  const seasonTitle = release.querySelector('h1.season-name cite')?.textContent.trim() || '';
  const episodeTitle = release.querySelector('h1.episode-name cite')?.textContent.trim() || '';
  const link = release.querySelector('a.available-episode-link')?.href || '';
  const pubDate = release.querySelector('meta[itemprop="datePublished"]')?.content || new Date().toISOString();
  const descriptionTime = release.querySelector('.available-time')?.textContent.trim() || '';
  const thumbnail = release.querySelector('img.thumbnail')?.src || '';
  const groupId = release.getAttribute('data-group-id') || '';
  const episodeNum = release.getAttribute('data-episode-num') || '';

  return {
    title: `${seasonTitle} - ${episodeTitle}`,
    link,
    pubDate: new Date(pubDate).toUTCString(),
    description: `${descriptionTime} - ${episodeTitle}`,
    image: thumbnail,
    guid: `${groupId}-${episodeNum}`
  };
});

// Genera el contenido RSS
const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Crunchyroll Simulcast (Hoy)</title>
  <link>https://www.crunchyroll.com/es/simulcastcalendar</link>
  <description>Lista RSS de estrenos hoy en Crunchyroll</description>
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

// Guarda el archivo XML
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/simulcast-rss.xml', rss);
console.log('✅ RSS generado: simulcast-rss.xml');
