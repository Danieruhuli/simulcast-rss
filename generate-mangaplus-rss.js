const fs = require('fs');
const { JSDOM } = require('jsdom');

const htmlPath = 'simulpub-mangaplus.html';
if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
  console.log('⚠️ Archivo HTML vacío o no encontrado. RSS no será generado.');
  process.exit(0);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const parseDate = text => {
  if (!text) return new Date();
  const match = text.match(/(\d{1,2})\.(\d{1,2})/);
  if (!match) return new Date();
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const now = new Date();
  let date = new Date(Date.UTC(now.getFullYear(), month - 1, day, 0, 0, 0));
  if (date > now) {
    date = new Date(Date.UTC(now.getFullYear() - 1, month - 1, day, 0, 0, 0));
  }
  return date;
};

const processTitleWrapper = wrapper => {
  const title = wrapper.querySelector('[class*="titleName_"]')?.textContent.trim() || '';
  const chapter = wrapper.querySelector('[class*="chapterTitle_"]')?.textContent.trim() || '';
  const updateText = wrapper.querySelector('[class*="updateText_"]')?.textContent.trim() || '';
  
  const imgEl = wrapper.querySelector('[class*="titleImage_"]');
  const altText = imgEl?.getAttribute('alt') || '';
  const imageSrc = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || '';
  
  let link = wrapper.querySelector('a[class*="titleImageContainer_"]')?.getAttribute('href') || '';
  if (link && !link.startsWith('http')) {
    link = `https://mangaplus.shueisha.co.jp${link}`;
  }
  
  const pubDate = parseDate(updateText).toUTCString();
  const description = chapter ? `[${chapter}] ${altText}` : altText;
  
  return {
    title: title + (chapter ? ` - ${chapter}` : ''),
    rawTitle: title,
    link,
    pubDate,
    description,
    image: imageSrc,
    chapter,
    updateText
  };
};

const processTopTitleWrapper = wrapper => {
  const title = wrapper.querySelector('[class*="topTitleName_"]')?.textContent.trim() || '';
  const chapter = wrapper.querySelector('[class*="topChapterTitle_"]')?.textContent.trim() || '';
  const updateText = wrapper.querySelector('[class*="upLabel_"]')?.textContent.trim() || '';
  
  const imgEl = wrapper.querySelector('[class*="topTitleImage_"]');
  const altText = imgEl?.getAttribute('alt') || '';
  const imageSrc = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || '';
  
  let link = '';
  const anchors = Array.from(wrapper.querySelectorAll('a[href]'));
  const titlesLink = anchors.find(a => a.getAttribute('href')?.includes('/titles/'));
  if (titlesLink) {
    link = titlesLink.getAttribute('href');
    if (!link.startsWith('http')) {
      link = `https://mangaplus.shueisha.co.jp${link}`;
    }
  }
  
  const pubDate = parseDate(updateText).toUTCString();
  const description = chapter ? `[${chapter}] ${altText}` : altText;
  
  return {
    title: title + (chapter ? ` - ${chapter}` : ''),
    rawTitle: title,
    link,
    pubDate,
    description,
    image: imageSrc,
    chapter,
    updateText
  };
};

const titleWrappers = Array.from(document.querySelectorAll('div[class*="UpdatedTitle-module_titleWrapper"]'));
const topWrappers = Array.from(document.querySelectorAll('div[class*="UpdatedTitle-module_topTitleWrapper"]'));

const items = [
  ...topWrappers.map(processTopTitleWrapper),
  ...titleWrappers.map(processTitleWrapper)
].filter(item => item.title && item.link);

const isNewRelease = chapter => {
  if (!chapter) return false;
  if (chapter === 'One-shot') return true;
  const matches = chapter.match(/#(\d+)/g);
  if (!matches) return false;
  return matches.some(match => {
    const num = parseInt(match.replace('#', ''), 10);
    return num >= 1 && num <= 4;
  });
};

const allItems = items;
const newItems = items.filter(item => isNewRelease(item.chapter));

const createRss = (itemsList, title, description) => `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${title}</title>
  <link>https://mangaplus.shueisha.co.jp/</link>
  <description>${description}</description>
  <language>es</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${itemsList
    .map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="false"><![CDATA[${item.title}]]></guid>
      <pubDate>${item.pubDate}</pubDate>
      <description><![CDATA[<img src="${item.image}" /><br/>${item.description}]]></description>
    </item>`)
    .join('')}
</channel>
</rss>`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/mangaplus-rss.xml', createRss(allItems, 'MangaPlus - Actualizaciones', 'RSS de todas las actualizaciones extraídas desde MangaPlus'));
fs.writeFileSync('docs/mangaplus-new-rss.xml', createRss(newItems, 'MangaPlus - Nuevos Estrenos', 'RSS filtrado solo para nuevos estrenos (capítulos #001-#004 o One-shot)'));

console.log(`✅ RSS generado: docs/mangaplus-rss.xml (${allItems.length} items)`);
console.log(`✅ RSS generado: docs/mangaplus-new-rss.xml (${newItems.length} items)`);
