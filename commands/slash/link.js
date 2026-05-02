import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Vincula tu cuenta con tu API key"),

  async execute(interaction) {
    const client = interaction.client;
    const userId = interaction.user.id;

    client.pendingLinks.set(userId, {
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const paso1 = new AttachmentBuilder("paso 1.png", { name: "paso1.png" });
    const paso2 = new AttachmentBuilder("paso 2.png", { name: "paso2.png" });

    const embedInstrucciones1 = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("Paso 1 — Entra a tu perfil")
      .setDescription(
        "Ve a [nihongotracker.app/settings](https://nihongotracker.app/settings) e inicia sesión si aún no lo has hecho.\n\n" +
        "Busca la sección **API Key**, ponle un nombre y haz click en **Generar**."
      )
      .setImage("attachment://paso1.png");

    const embedInstrucciones2 = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("Paso 2 — Copia y pega tu API Key")
      .setDescription(
        "Copia la API Key que se generó y **pégala aquí en el chat**.\n\n" +
        "Tienes **10 minutos** antes de que expire."
      )
      .setImage("attachment://paso2.png")
      .setFooter({ text: "nihongotracker.app  ·  Este mensaje expira en 10 minutos" });

    try {
      await interaction.user.send({
        embeds: [embedInstrucciones1, embedInstrucciones2],
        files: [paso1, paso2]
      });

      const embedRespuesta = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("📬 Revisa tus DMs")
        .setDescription("Te envié un mensaje directo con las instrucciones para vincular tu cuenta.")
        .setFooter({ text: "Si no recibes el DM, asegúrate de tener los mensajes directos activados." });

      await interaction.reply({ embeds: [embedRespuesta], flags: 64 });

    } catch (err) {
      console.error("Error enviando DM en /link:", err);

      const embedError = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ No pude enviarte un DM")
        .setDescription(
          "Activa los mensajes directos para poder vincularte.\n\n" +
          "Ve a **Configuración → Privacidad y seguridad** y activa **Mensajes directos de miembros del servidor**."
        );

      await interaction.reply({ embeds: [embedError], flags: 64 });
    }
  }
};