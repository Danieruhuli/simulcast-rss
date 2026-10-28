const fs = require('fs');
const { JSDOM } = require('jsdom');
const xml2js = require('xml2js');

const htmlPath = 'simulcast.html';
const rssFile = 'docs/simulcast-rss.xml';

if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
  console.log('⚠️ Archivo HTML vacío o no encontrado. RSS no será generado.');
  process.exit(0);
}

const document = new JSDOM(fs.readFileSync(htmlPath, 'utf8')).window.document;
const calendar = document.querySelector('.erc-release-calendar-content');

if (!calendar) {
  console.log('⚠️ No se encontró .erc-release-calendar-content. RSS no será generado.');
  process.exit(0);
}

const spanishMonths = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7,
  sep: 8, septiembre: 8, sept: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
};

function parseCalendarDate(headerText) {
  const match = headerText.match(/(\d{1,2})(?:\s+de)?\s*([A-Za-záéíóúü]+)/i);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const month = spanishMonths[monthName] ?? spanishMonths[monthName.slice(0, 3)];

  return Number.isInteger(month) ? { day, month } : null;
}

function resolveCalendarYears(columns) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const parsedDates = columns.map((column, index) => {
    const header = column.querySelector('.day-header');
    const dateAttribute = header?.querySelector('[datetime]')?.getAttribute('datetime') || header?.getAttribute('datetime');
    if (dateAttribute) {
      const attributeDate = new Date(dateAttribute);
      if (!Number.isNaN(attributeDate.getTime())) {
        return { day: attributeDate.getUTCDate(), month: attributeDate.getUTCMonth() };
      }
    }
    return parseCalendarDate(header?.textContent || header?.getAttribute('aria-label') || '');
  });

  const firstDate = parsedDates.find(Boolean);
  let year = currentYear;

  if (firstDate && firstDate.month < now.getMonth() - 1) {
    year++;
  }

  let previousMonth = firstDate?.month;
  return parsedDates.map((date, index) => {
    if (!date) return null;

    if (index > 0 && previousMonth !== undefined && date.month < previousMonth) {
      year++;
    }

    previousMonth = date.month;
    return new Date(Date.UTC(year, date.month, date.day));
  });
}

function parsePublishTime(text, date) {
  if (!date || !text) return null;

  const normalized = text
    .replace(/\bHora de estreno:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  const match = normalized.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const isPm = /p\s*\.\s*m\.?/i.test(normalized) || /\bpm\b/i.test(normalized);
  const isAm = /a\s*\.\s*m\.?/i.test(normalized) || /\bam\b/i.test(normalized);

  if (isPm && hour !== 12) hour += 12;
  if (isAm && hour === 12) hour = 0;

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
}

function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : new URL(url, 'https://www.crunchyroll.com').toString();
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function loadPreviousItems(filePath) {
  try {
    const xml = await fs.promises.readFile(filePath, 'utf8');
    const parsed = await xml2js.parseStringPromise(xml);
    const rawItems = parsed.rss.channel[0].item || [];

    return rawItems.map(item => {
      const description = item.description?.[0] || '';
      const imageMatch = description.match(/<img src="([^"]+)"/);

      return {
        title: item.title?.[0] || '',
        link: item.link?.[0] || '',
        guid: item.guid?.[0]?._ || item.guid?.[0] || '',
        pubDate: item.pubDate?.[0] || '',
        description: description.replace(/<img[^>]*>/, '').replace(/<br\/?\>/g, '').trim(),
        image: imageMatch?.[1] || '',
      };
    });
  } catch (error) {
    console.warn(`⚠️ No se pudo cargar el RSS anterior: ${error.message}`);
    return [];
  }
}

const columns = [...calendar.querySelectorAll('.erc-day-column')];
const columnDates = resolveCalendarYears(columns);
const newItems = [];


columns.forEach((column, columnIndex) => {
  const date = columnDates[columnIndex];
  const cells = column.querySelectorAll('.day-body .grid-cell, .grid-cell[data-t="release-cell"]');

  cells.forEach(cell => {
    const card = cell.querySelector('[class*="release-calendar-card"]') || cell;
    const linkElement = cell.querySelector('[data-t="watch-page-link"]') || cell.querySelector('a[href*="/watch/"]') || cell.querySelector('a[href]');
    const titleElement = cell.querySelector('[class*="release-calendar-card__title"]') || cell.querySelector('h3, h4');
    const episodeElement = cell.querySelector('[data-t="episodes"]');
    const publishElement = cell.querySelector('[data-t="publish-time"]') || cell.querySelector('[class*="release-calendar-card__publish-time"]');

    const title = titleElement?.textContent.trim().replace(/\s+/g, ' ') || '';
    const episodeInfo = episodeElement?.textContent.trim().replace(/\s+/g, ' ') || '';
    const link = absoluteUrl(linkElement?.getAttribute('href'));
    const publishDate = parsePublishTime(publishElement?.textContent || '', date);

    if (!link || !title || !publishDate) return;

    const thumbnail = cell.querySelector('[class*="release-calendar-card__thumbnail"] img') || cell.querySelector('img[src], img[data-src]');
    const image = absoluteUrl(thumbnail?.getAttribute('data-src') || thumbnail?.getAttribute('src'));

    const episodeMatch = episodeInfo.match(/S(\d+)\s*:\s*(\d+(?:\s*-\s*\d+)?)/i);
    const episodeSuffix = episodeMatch
      ? `S${episodeMatch[1]}: ${episodeMatch[2].replace(/\s+/g, '')}`
      : '';

    const srOnlyLabel = [...cell.querySelectorAll('[data-t="sr-only"]')]
      .map(element => element.textContent.trim().replace(/\s+/g, ' ').replace(/\u00a0/g, ' '))
      .find(text => /^Ver\b/i.test(text));
    let description = srOnlyLabel || episodeInfo || title;
    description = description
      .replace(/,\s*Hora de estreno:\s*[\d:]+(?:\s*[ap]\.?\s*m\.?)?\s*,/i, ',')
      .trim();

    const premiereTag = [...cell.querySelectorAll('[class]')].find(element => {
      const classes = new Set((element.getAttribute('class') || '').split(/\s+/));
      return classes.has('text--is-xs--5PTBo') && classes.has('info-tag__item--avQcC');
    });
    const isPremiere = Boolean(premiereTag);

    if (isPremiere) {
      description = `[Estreno] ${description}`;
    }

    const guid = link.replace('https://www.crunchyroll.com/es/watch/', '').replace(/^\/es\/watch\//, '').replace(/^http:\/\/[^/]+/, '');

    newItems.push({
      title: episodeSuffix ? `${title} - ${episodeSuffix}` : title,
      link,
      guid,
      pubDate: publishDate.toUTCString(),
      description,
      image,
    });
  });
});

async function main() {
  let previousItems = [];
  if (fs.existsSync(rssFile)) {
    previousItems = await loadPreviousItems(rssFile);
  }

  const combined = [...previousItems, ...newItems];
  const uniqueByGuid = Array.from(new Map(combined.map(item => [item.guid, item])).values());
  const merged = uniqueByGuid.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const now = new Date();
  const filteredItems = merged.filter(item => new Date(item.pubDate) <= now).slice(0, 70);

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>Los Últimos Videos de Crunchyroll</title>
  <link>https://www.crunchyroll.com/es/releasecalendar</link>
  <description>Lista RSS de estrenos en Crunchyroll</description>
  <language>es</language>
  <lastBuildDate>${now.toUTCString()}</lastBuildDate>
${filteredItems.map(item => `  <item>
    <title><![CDATA[${item.title}]]></title>
    <link>${escapeXml(item.link)}</link>
    <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
    <pubDate>${escapeXml(item.pubDate)}</pubDate>
    <description><![CDATA[<img src="${escapeXml(item.image)}" /><br/>${item.description}]]></description>
  </item>`).join('\n')}
</channel>
</rss>`;

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(rssFile, rss);
  console.log(`✅ RSS moderno generado: ${rssFile}`);
  console.log(`🆕 Elementos nuevos: ${newItems.length}`);
  console.log(`📋 Elementos finales: ${filteredItems.length}`);
}

main();
