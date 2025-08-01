const puppeteer = require("puppeteer");
const fs = require("fs");
const RSS = require("rss");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("https://www.crunchyroll.com/es/simulcastcalendar", { waitUntil: "networkidle2" });
  await page.waitForSelector(".erc-simulcast-calendar .tile");

  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".erc-simulcast-calendar .tile")).map(tile => ({
      title: tile.querySelector(".tile__title")?.textContent.trim(),
      link: tile.querySelector("a")?.href,
      image: tile.querySelector("img")?.src
    }));
  });

  const feed = new RSS({
    title: "Crunchyroll Simulcast",
    description: "Episodios recientes en Crunchyroll",
    feed_url: "https://<TU-USUARIO>.github.io/crunchyroll-simulcast-rss/data/feed.xml",
    site_url: "https://www.crunchyroll.com/",
    language: "es",
  });

  items.forEach(item => {
    feed.item({
      title: item.title,
      url: item.link,
      description: `<img src="${item.image}"/>`,
      date: new Date(),
    });
  });

  fs.writeFileSync("./data/feed.xml", feed.xml({ indent: true }));
  await browser.close();
})();
