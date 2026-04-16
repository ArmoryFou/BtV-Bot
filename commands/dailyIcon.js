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

// ⏰ calcular ms hasta medianoche
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date();

  midnight.setHours(24, 0, 0, 0);

  return midnight - now;
}

export default {
  name: "ready",

  async execute(client) {
    console.log("Daily icon scheduler activo");

    const run = async () => {
      try {
        const guild = client.guilds.cache.first();

        if (!guild) return;

        const files = getImages();
        if (files.length === 0) return;

        const selected = weightedChoice(files);
        const filePath = path.join(FOLDER, selected);
        const buffer = fs.readFileSync(filePath);

        const name = selected.replace(".jpg", "");

        await guild.setIcon(buffer);
        await guild.setName(name);

        console.log("Icono diario cambiado a:", name);

      } catch (err) {
        console.error("Error en tarea diaria:", err);
      }
    };

    // esperar hasta medianoche
    setTimeout(() => {
      run();

      // luego cada 24h
      setInterval(run, 24 * 60 * 60 * 1000);

    }, msUntilMidnight());
  }
};