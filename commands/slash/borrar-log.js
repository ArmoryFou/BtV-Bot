const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const API_BASE = "https://nihongotracker.app/api";
const CLUB_ID = "6951b8e3319c4aea0d5d2b2d";

const getHeaders = (apiKey) => ({
  "X-API-Key": apiKey,
  "Content-Type": "application/json",
  "Accept": "application/json"
});

function formatChoiceName(name) {
  const value = String(name || "Desconocido").trim() || "Desconocido";
  return value.length <= 100 ? value : `${value.slice(0, 97)}...`;
}

async function fetchRecentClubActivity() {
  const { data } = await axios.get(`${API_BASE}/clubs/${CLUB_ID}/recent-activity`, {
    params: { limit: 50 }
  });
  return Array.isArray(data?.activities) ? data.activities : [];
}

function activityTitle(activity) {
  return (
    activity.mediaData?.contentTitleEnglish ||
    activity.mediaData?.contentTitleRomaji ||
    activity.mediaData?.contentTitleNative ||
    activity.description ||
    "Log sin título"
  );
}

function activityDate(activity) {
  const date = new Date(activity.date || activity.createdAt);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es-MX");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("borrar-log")
    .setDescription("Borra uno de tus logs recientes (también en nihongotracker.app)")
    .addStringOption(o =>
      o.setName("log")
        .setDescription("Selecciona el log a borrar")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ================= AUTOCOMPLETE =================
  // Nota: solo puede sugerir logs dentro de la actividad reciente del club
  // (últimas 50 entradas compartidas por todos los miembros). Si tu log ya
  // no aparece ahí, no habrá aviso, y probablemente por eso, no hay que
  // preocuparse.
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();

    const userDoc = await interaction.client.db.findOne({ discordId: interaction.user.id });
    const username = userDoc?.nihongoUsername;

    if (!username) return interaction.respond([]);

    try {
      const activities = await fetchRecentClubActivity();
      const mine = activities.filter(
        a => a.user?.username?.toLowerCase() === username.toLowerCase()
      );

      const filtered = focused
        ? mine.filter(a => activityTitle(a).toLowerCase().includes(focused))
        : mine;

      return interaction.respond(
        filtered.slice(0, 25).map(a => ({
          name: formatChoiceName(`${activityTitle(a)} — ${activityDate(a)}`),
          value: String(a._id)
        }))
      );
    } catch (err) {
      console.error("Borrar-log autocomplete error:", err.response?.status, err.message);
      return interaction.respond([]);
    }
  },

  // ================= EXECUTE =================
  async execute(interaction) {
    const logId = interaction.options.getString("log");

    await interaction.deferReply({ flags: 64 });

    const userDoc = await interaction.client.db.findOne({ discordId: interaction.user.id });
    if (!userDoc?.apiKey) {
      return interaction.editReply({
        content: "Necesitas vincular tu cuenta con **/link** antes de poder borrar logs."
      });
    }

    try {
      await axios.delete(`${API_BASE}/logs/${logId}`, {
        headers: getHeaders(userDoc.apiKey)
      });
    } catch (err) {
      console.error("Log delete error:", err.response?.status, err.response?.data || err.message);

      if (err.response?.status === 404) {
        return interaction.editReply({ content: "No encontré ese log en nihongotracker.app (¿ya estaba borrado?)." });
      }

      return interaction.editReply({ content: "No pude borrar el log en nihongotracker.app." });
    }

    // Mantiene sincronizado el registro local del bot, si existe.
    await interaction.client.db.updateOne(
      { _id: `discord-log:${logId}` },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: interaction.user.id
        }
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle("🗑️ Log borrado")
      .setDescription("El log se eliminó de nihongotracker.app.")
      .setFooter({ text: `ID: ${logId}` });

    return interaction.editReply({ embeds: [embed] });
  }
};
