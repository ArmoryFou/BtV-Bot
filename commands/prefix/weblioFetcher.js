import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function fetchWeblio(term) {
  const url = `https://www.weblio.jp/content/${encodeURIComponent(term)}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  // bloque principal del artículo
  const dictBlock = $(".kiji").first();
  if (!dictBlock.length) return null;

  const title =
    dictBlock.find("h2").first().text().trim() || term;

  let reading = "";
  dictBlock.find(".kana").each((_, el) => {
    const t = $(el).text().trim();
    if (t) reading = t;
  });

  const meanings = [];

  dictBlock.find("div").each((_, el) => {
    const text = $(el).text().trim();
    if (
      /^[０-９0-9]+/.test(text) ||
      /^[１-９]/.test(text)
    ) {
      meanings.push(text);
    }
  });

  if (!meanings.length) {
    dictBlock.find("p").each((_, el) => {
      const t = $(el).text().trim();
      if (t) meanings.push(t);
    });
  }

  return {
    title,
    reading,
    meanings: meanings.slice(0, 6),
    source: "デジタル大辞泉 via Weblio",
    url
  };
}
