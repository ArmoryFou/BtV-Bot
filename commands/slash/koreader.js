import { SlashCommandBuilder } from "discord.js";
import crypto from "crypto";

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildInstructions(token) {
  return [
    "**Tu KOReader ya puede conectarse al bot.**",
    "",
    `Token: \`${token}\``,
    "",
    "Pégalo en la config del plugin `send2discord.koplugin` de tu KOReader:",
    "```lua",
    `local SERVER_URL = "http://TU_SERVIDOR:3939/koreader/highlight"`,
    `local TOKEN = "${token}"`,
    "```",
    "",
    "Este token es permanente. Si se filtra o quieres invalidarlo, usa `/koreader regenerar`.",
  ].join("\n");
}

export default {
  data: new SlashCommandBuilder()
    .setName("koreader")
    .setDescription("Conecta tu KOReader con el bot")
    .addSubcommand((sub) =>
      sub
        .setName("conectar")
        .setDescription("Muestra tu token de conexión (lo genera si no tienes uno)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("regenerar")
        .setDescription("Genera un token nuevo, invalidando el anterior")
    ),

  async execute(interaction) {
    // Se usa interaction.client.db en vez de recibir client como argumento,
    // así funciona sin importar cómo tu interactionCreate llame a execute().
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    const userLink = await db.findOne({ _id: `koreader-user:${userId}` });

    if (sub === "conectar" && userLink) {
      return interaction.reply({
        content: buildInstructions(userLink.token),
        ephemeral: true,
      });
    }

    // sub === "regenerar", o "conectar" sin token previo: crea uno nuevo.
    if (userLink) {
      await db.deleteOne({ _id: `koreader-token:${userLink.token}` });
    }

    const token = generateToken();

    await db.updateOne(
      { _id: `koreader-token:${token}` },
      {
        $set: {
          kind: "koreaderToken",
          token,
          discordUserId: userId,
          discordUsername: interaction.user.username,
          discordAvatar: interaction.user.displayAvatarURL(),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    await db.updateOne(
      { _id: `koreader-user:${userId}` },
      { $set: { kind: "koreaderUserLink", token, updatedAt: new Date() } },
      { upsert: true }
    );

    return interaction.reply({
      content: buildInstructions(token),
      ephemeral: true,
    });
  },
};
