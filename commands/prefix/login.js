import { Events } from "discord.js";
import crypto from "crypto";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const LOGIN_PREFIXES = ["!login", "login"];
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = "nihongotracker";

let mongoClient = null;

async function getDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
  }

  return mongoClient.db(DB_NAME);
}

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (message.author.bot) return;

    const content = message.content.trim().toLowerCase();
    if (!LOGIN_PREFIXES.includes(content)) return;

    try {
      const db = await getDB();
      const token = crypto.randomUUID();

      // borrar tokens anteriores del mismo usuario
      await db.collection("discord_link_tokens").deleteMany({
        discordId: message.author.id
      });

      // insertar nuevo token
      await db.collection("discord_link_tokens").insertOne({
        _id: token,
        discordId: message.author.id,
        username: message.author.username,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
        createdAt: new Date()
      });

      const url = `https://nihongotracker.app/discord-link?token=${token}`;

      await message.reply(
        `🔐 Vincula tu cuenta aquí:\n${url}\n\n⏳ Expira en 10 minutos.`
      );
    } catch (error) {
      console.error("Login command error:", error);

      await message.reply(
        "❌ Ocurrió un error al generar tu enlace."
      );
    }
  }
};