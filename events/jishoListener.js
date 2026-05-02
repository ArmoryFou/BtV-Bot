import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const JISHO_PREFIXES = ["い ", "い　"];
const PAGE_SIZE = 4;

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (message.author.bot) return;

    const prefix = JISHO_PREFIXES.find(p =>
      message.content.startsWith(p)
    );
    if (!prefix) return;

    const query = message.content.slice(prefix.length).trim();
    if (!query) return;

    const res = await fetch(
      `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`
    );
    const json = await res.json();
    if (!json.data?.length) {
      await message.reply("❌ No se encontraron resultados.");
      return;
    }

    // AGRUPAR COMO KOTOBA
    const grouped = new Map();

    for (const item of json.data) {
      const meanings = item.senses
        .flatMap(s => s.english_definitions)
        .filter((v, i, a) => a.indexOf(v) === i);

      const key = meanings.join("|");

      if (!grouped.has(key)) {
        grouped.set(key, {
          forms: [],
          meanings,
          jlpt: item.jlpt?.[0]?.toUpperCase() ?? "—",
          common: item.is_common ? "Sí" : "No"
        });
      }

      for (const j of item.japanese) {
        const form = j.word
          ? `${j.word}（${j.reading}）`
          : j.reading;
        grouped.get(key).forms.push(form);
      }
    }

    const entries = [...grouped.values()].map(e => {
      return (
        `**${[...new Set(e.forms)].join(" / ")}**\n` +
        e.meanings.join("\n") +
        `\n**JLPT:** ${e.jlpt} | **Common:** ${e.common}`
      );
    });

    const pages = [];
    for (let i = 0; i < entries.length; i += PAGE_SIZE) {
      pages.push(entries.slice(i, i + PAGE_SIZE).join("\n\n"));
    }

    let page = 0;

    const embed = new EmbedBuilder()
      .setTitle(`📘 ${query}`)
      .setDescription(pages[0])
      .setFooter({ text: `Página 1 de ${pages.length}` })
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.channel.send({
      embeds: [embed],
      components: pages.length > 1 ? [row] : []
    });

    if (pages.length === 1) return;

    const collector = msg.createMessageComponentCollector({
      time: 5 * 60_000
    });

    collector.on("collect", async i => {
      if (i.user.id !== message.author.id)
        return i.deferUpdate();

      page += i.customId === "next" ? 1 : -1;
      page = Math.max(0, Math.min(page, pages.length - 1));

      embed
        .setDescription(pages[page])
        .setFooter({ text: `Página ${page + 1} de ${pages.length}` });

      await i.update({ embeds: [embed] });
    });
  }
};
