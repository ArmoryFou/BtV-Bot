import fs from "fs";
import path from "path";

const FOLDER = "./output";

const SPECIAL_PROB = {
  "幸福きゃんきゃん.jpg": 0.01,
  "Misterious.jpg": 0.00001
};

function getImages() {
  return fs.readdirSync(FOLDER).filter(f => f.endsWith(".jpg"));
}

function weightedChoice(files) {
  const specials = [];
  const normals = [];

  for (const f of files) {
    if (SPECIAL_PROB[f]) specials.push(f);
    else normals.push(f);
  }

  let r = Math.random();
  let cumulative = 0;

  for (const f of specials) {
    cumulative += SPECIAL_PROB[f];
    if (r < cumulative) return f;
  }

  return normals[Math.floor(Math.random() * normals.length)];
}

export default {
  name: "messageCreate",

  async execute(message) {
    // 🔒 solo admins
    if (!message.member.permissions.has("Administrator")) return;

    if (message.content !== "!icon") return;

    const files = getImages();

    if (files.length === 0) {
      return message.reply("No hay imágenes.");
    }

    const selected = weightedChoice(files);
    const filePath = path.join(FOLDER, selected);

    try {
      const buffer = fs.readFileSync(filePath);

      // nombre sin .jpg
      const name = selected.replace(".jpg", "");

      // 🔥 cambiar icono
      await message.guild.setIcon(buffer);

      // 🔥 cambiar nombre del servidor
      await message.guild.setName(name);

      await message.reply(`Servidor actualizado a: **${name}**`);

    } catch (err) {
      console.error(err);
      message.reply("Error al cambiar el servidor.");
    }
  }
};