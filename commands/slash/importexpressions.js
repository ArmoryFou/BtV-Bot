const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  fetchSourceMessage,
  importExpressions,
  parseMessageId
} = require("../../lib/expressionImporter.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("importexpressions")
    .setDescription("Importa emojis y stickers de un mensaje visible para el bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName("mensaje")
        .setDescription("ID o enlace del mensaje fuente")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("canal_id")
        .setDescription("ID del canal fuente si es distinto al canal actual")
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Solo los administradores pueden importar expresiones.", flags: 64 });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({
        content: "Necesito el permiso **Manage Guild Expressions** para crear emojis o stickers.",
        flags: 64
      });
    }

    const messageId = parseMessageId(interaction.options.getString("mensaje"));
    const channelId = interaction.options.getString("canal_id");
    if (!messageId) {
      return interaction.reply({ content: "El ID o enlace de mensaje no es válido.", flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let sourceMessage;
    try {
      sourceMessage = await fetchSourceMessage(interaction.client, interaction.channel, messageId, channelId);
    } catch (err) {
      return interaction.editReply("No pude leer ese mensaje. El bot necesita acceso al canal fuente e historial de mensajes.");
    }

    const result = await importExpressions({
      guild: interaction.guild,
      sourceMessage,
      reason: `Imported from message ${sourceMessage.id} by ${interaction.user.tag}`
    });
    const created = result.created.map(item => `${item.type === "emoji" ? "Emoji" : "Sticker"}: ${item.value}`);
    const skipped = result.failures.map(item => `${item.type === "emoji" ? "Emoji" : "Sticker"} \`${item.name}\`: ${item.error}`);

    if (created.length === 0 && skipped.length === 0) {
      return interaction.editReply("Ese mensaje no contiene emojis personalizados ni stickers importables. Los emojis Unicode no se pueden añadir al servidor.");
    }

    const lines = [
      created.length > 0 ? `Importados:\n${created.join("\n")}` : null,
      skipped.length > 0 ? `Omitidos:\n${skipped.slice(0, 8).join("\n")}` : null
    ].filter(Boolean);

    return interaction.editReply(lines.join("\n\n"));
  }
};
