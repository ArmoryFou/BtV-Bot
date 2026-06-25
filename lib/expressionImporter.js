const { ChannelType } = require("discord.js");

const CUSTOM_EMOJI = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;

function uniqueEmojiName(guild, baseName) {
  const clean = baseName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 28) || "emoji";
  let name = clean.length < 2 ? `${clean}_x` : clean;
  let suffix = 2;

  while (guild.emojis.cache.some(emoji => emoji.name === name)) {
    const addition = `_${suffix++}`;
    name = `${clean.slice(0, 32 - addition.length)}${addition}`;
  }

  return name;
}

function uniqueStickerName(guild, baseName) {
  const clean = (baseName || "sticker").trim().slice(0, 30) || "sticker";
  let name = clean.length < 2 ? `${clean} x` : clean;
  let suffix = 2;

  while (guild.stickers.cache.some(sticker => sticker.name === name)) {
    const addition = ` ${suffix++}`;
    name = `${clean.slice(0, 30 - addition.length)}${addition}`;
  }

  return name;
}

function parseMessageId(value) {
  const match = String(value).match(/(\d{17,20})$/);
  return match?.[1] ?? null;
}

async function fetchSourceMessage(client, currentChannel, messageId, channelId) {
  const channel = channelId
    ? await client.channels.fetch(channelId)
    : currentChannel;

  if (!channel?.isTextBased() || channel.type === ChannelType.GuildVoice) {
    throw new Error("El canal fuente debe permitir leer mensajes.");
  }

  return channel.messages.fetch(messageId);
}

function getCustomEmojis(message) {
  const emojis = new Map();
  for (const match of message.content.matchAll(CUSTOM_EMOJI)) {
    const [, animated, name, id] = match;
    emojis.set(id, { animated: Boolean(animated), name, id });
  }
  return emojis;
}

async function importExpressions({ guild, sourceMessage, reason }) {
  const emojis = getCustomEmojis(sourceMessage);
  const created = [];
  const failures = [];

  for (const emoji of emojis.values()) {
    try {
      const extension = emoji.animated ? "gif" : "png";
      const imported = await guild.emojis.create({
        attachment: `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?quality=lossless`,
        name: uniqueEmojiName(guild, emoji.name),
        reason
      });
      created.push({ type: "emoji", name: imported.name, value: String(imported) });
    } catch (err) {
      failures.push({ type: "emoji", name: emoji.name, error: err.message });
    }
  }

  for (const sticker of sourceMessage.stickers.values()) {
    try {
      const imported = await guild.stickers.create({
        file: sticker.url,
        name: uniqueStickerName(guild, sticker.name),
        description: sticker.description || null,
        tags: sticker.tags || "sticker",
        reason
      });
      created.push({ type: "sticker", name: imported.name, value: imported.name });
    } catch (err) {
      failures.push({ type: "sticker", name: sticker.name, error: err.message });
    }
  }

  return { created, failures, found: emojis.size + sourceMessage.stickers.size };
}

module.exports = {
  fetchSourceMessage,
  importExpressions,
  parseMessageId
};
