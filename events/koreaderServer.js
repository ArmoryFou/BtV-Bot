import express from "express";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";

const PORT = process.env.KOREADER_PORT || 3939;
const TARGET_CHANNEL_ID = process.env.KOREADER_NOVEL_CHANNEL_ID;

// Canales distintos para captura de novela vs manga.
// Si no configuras las variables de entorno, ambas caen al mismo canal de arriba.
const SCREENSHOT_CHANNELS = {
  novela: process.env.KOREADER_NOVEL_CHANNEL_ID || TARGET_CHANNEL_ID,
  manga: process.env.KOREADER_MANGA_CHANNEL_ID || TARGET_CHANNEL_ID,
};

const MAX_TEXT_LENGTH = 1800; // deja margen dentro del límite de 4096 de un embed
const MAX_IMAGE_MB = 8; // límite de subida normal de Discord (sin Nitro)

function addMetaFields(embed, { title, author, chapter, percent }) {
  if (title) embed.addFields({ name: "📖 Libro", value: String(title).slice(0, 256), inline: true });
  if (author) embed.addFields({ name: "✍️ Autor", value: String(author).slice(0, 256), inline: true });
  if (chapter) embed.addFields({ name: "🔖 Capítulo", value: String(chapter).slice(0, 256), inline: true });
  if (typeof percent === "number" && !Number.isNaN(percent)) {
    embed.addFields({ name: "📊 Progreso", value: `${percent.toFixed(1)}%`, inline: true });
  }
}

function buildBaseEmbed({ discordUsername, discordAvatar, footerText }) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: discordUsername || "Usuario desconocido",
      iconURL: discordAvatar || undefined,
    })
    .setFooter({ text: footerText })
    .setTimestamp(new Date());
}

function buildHighlightEmbed({ text, title, author, chapter, percent, discordUsername, discordAvatar }) {
  const embed = buildBaseEmbed({ discordUsername, discordAvatar, footerText: "📱 enviado desde KOReader" })
    .setDescription(`||${text}||`);
  addMetaFields(embed, { title, author, chapter, percent });
  return embed;
}

function buildScreenshotEmbed({ title, author, chapter, percent, discordUsername, discordAvatar }) {
  const embed = buildBaseEmbed({ discordUsername, discordAvatar, footerText: "📱 captura desde KOReader" });
  addMetaFields(embed, { title, author, chapter, percent });
  return embed;
}

function startKoreaderServer(client) {
  const app = express();
  app.use(express.json({ limit: "10mb" })); // deja margen sobre MAX_IMAGE_MB por el overhead de base64

  app.post("/koreader/highlight", async (req, res) => {
    try {
      const { token, text, title, author, chapter, percent } = req.body ?? {};

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "missing token" });
      }
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "missing text" });
      }

      const link = await client.db.findOne({ _id: `koreader-token:${token}` });
      if (!link) {
        return res.status(401).json({ error: "invalid token" });
      }

      const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
      if (!channel?.isTextBased()) {
        console.error(`[koreaderServer] Channel ${TARGET_CHANNEL_ID} not found or not text-based.`);
        return res.status(500).json({ error: "channel unavailable" });
      }

      const trimmedText = text.trim().slice(0, MAX_TEXT_LENGTH);

      const embed = buildHighlightEmbed({
        text: trimmedText,
        title,
        author,
        chapter,
        percent: typeof percent === "number" ? percent : undefined,
        discordUsername: link.discordUsername,
        discordAvatar: link.discordAvatar,
      });

      await channel.send({ embeds: [embed] });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[koreaderServer] Error:", err.message);
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.post("/koreader/screenshot", async (req, res) => {
    try {
      const { token, image_base64, title, author, chapter, percent, category, nsfw, spoiler } = req.body ?? {};

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "missing token" });
      }
      if (!image_base64 || typeof image_base64 !== "string") {
        return res.status(400).json({ error: "missing image" });
      }

      const channelId = SCREENSHOT_CHANNELS[category] || SCREENSHOT_CHANNELS.novela; //[cite: 6]

      const link = await client.db.findOne({ _id: `koreader-token:${token}` }); //[cite: 6]
      if (!link) {
        return res.status(401).json({ error: "invalid token" }); //[cite: 6]
      }

      const channel = await client.channels.fetch(channelId).catch(() => null); //[cite: 6]
      if (!channel?.isTextBased()) {
        console.error(`[koreaderServer] Channel ${channelId} not found or not text-based.`); //[cite: 6]
        return res.status(500).json({ error: "channel unavailable" }); //[cite: 6]
      }

      const buffer = Buffer.from(image_base64, "base64"); //[cite: 6]
      if (buffer.byteLength > MAX_IMAGE_MB * 1024 * 1024) { //[cite: 6]
        return res.status(413).json({ error: "image too large" }); //[cite: 6]
      }

      // Nombre del archivo condicionado por la opción "spoiler" elegida en la Kindle
      const filename = spoiler ? "SPOILER_screenshot.png" : "screenshot.png";
      const attachment = new AttachmentBuilder(buffer, { name: filename });

      // Personalizamos el Embed según si es NSFW o no
      const embedColor = nsfw ? 0xED4245 : 0x5865F2; // Rojo Discord vs Azul clásico
      const footerLabel = nsfw ? "🔞 Captura NSFW desde KOReader" : "📱 captura desde KOReader";

      const embed = buildBaseEmbed({ 
        discordUsername: link.discordUsername, 
        discordAvatar: link.discordAvatar, 
        footerText: footerLabel 
      }).setColor(embedColor);

      if (nsfw) {
        embed.setTitle("⚠️ ALERTA: Contenido Adulto / Sensible (NSFW) ⚠️");
      }

      addMetaFields(embed, { 
        title, 
        author, 
        chapter, 
        percent: typeof percent === "number" ? percent : undefined 
      });

      await channel.send({ embeds: [embed], files: [attachment] }); //[cite: 6]

      return res.status(200).json({ ok: true }); //[cite: 6]
    } catch (err) {
      console.error("[koreaderServer] screenshot error:", err.message); //[cite: 6]
      return res.status(500).json({ error: "internal error" }); //[cite: 6]
    }
  });

  app.listen(PORT, () => {
    console.log(`[koreaderServer] Listening on port ${PORT}`);
  });
}

export default {
  name: "clientReady",
  once: true,

  execute(client) {
    if (client.koreaderServerStarted) return;
    client.koreaderServerStarted = true;
    startKoreaderServer(client);
  },
};