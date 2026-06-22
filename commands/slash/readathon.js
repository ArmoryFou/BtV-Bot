const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const readathon = require("../../lib/readathon.js");

function toEmbed(event) {
  const data = readathon.buildEmbedData(event);
  return new EmbedBuilder()
    .setColor(data.color)
    .setTitle(data.title)
    .setDescription(data.description)
    .addFields(data.fields)
    .setFooter({ text: data.footer })
    .setTimestamp(new Date(data.timestamp));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("readathon")
    .setDescription("Crea un readathon para el club")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName("fecha")
        .setDescription("Fecha de inicio en formato DD/MM/AAAA")
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName("meta_horas")
        .setDescription("Meta conjunta de horas")
        .setMinValue(0.1)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Solo los administradores pueden crear un readathon.", flags: 64 });
    }

    const date = interaction.options.getString("fecha");
    const targetHours = interaction.options.getNumber("meta_horas");
    if (!readathon.parseDate(date)) {
      return interaction.reply({ content: "Usa la fecha en formato DD/MM/AAAA.", flags: 64 });
    }

    await interaction.deferReply();

    try {
      const event = await readathon.createReadathon(interaction.client.db, {
        date,
        targetHours,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdBy: interaction.user.id
      });
      const refreshed = await readathon.refreshReadathon(interaction.client.db, event.readathonId);
      const message = await interaction.editReply({ embeds: [toEmbed(refreshed)] });

      await interaction.client.db.updateOne(
        { _id: event._id },
        { $set: { messageId: message.id, updatedAt: new Date() } }
      );
    } catch (err) {
      console.error("Readathon create error:", err.response?.data || err.message);
      await interaction.editReply("No pude crear el readathon.");
    }
  },

  toEmbed
};
