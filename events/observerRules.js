import { Events } from "discord.js";

const RULE_2_TERMS = [
  "hornet",
  "little",
  "princess",
  "panties",
  "demon lord",
  "rey demonio"
];

function countLetters(text) {
  return [...text.matchAll(/\p{L}/gu)].length;
}

function hasWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "iu");
  return regex.test(text);
}

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (message.author.bot) return;

    const content = message.content.trim();
    const contentLower = content.toLowerCase();

    if (countLetters(content) === 8) {
      await message.reply("comeme mi biscocho");
      return;
    }

    const hasRule2Term = RULE_2_TERMS.some(term =>
      contentLower.includes(term)
    );

    const hasQueAndAnio =
      hasWord(contentLower, "que") &&
      (hasWord(contentLower, "año") || hasWord(contentLower, "ano"));

    if (hasRule2Term || hasQueAndAnio) {
      await message.reply("リトルプリンセス.");
      return;
    }

    if (hasWord(contentLower, "divulgación") || hasWord(contentLower, "divulgacion")) {
      await message.reply("delfos");
      return;
    }

    if (contentLower.includes("gi0998")) {
      await message.reply("RANCE WAS BORN.");
    }
  }
};
