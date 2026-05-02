const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const axios = require("axios");

const API_BASE = "https://nihongotracker.app/api";
const CLUB_ID = "6951b8e3319c4aea0d5d2b2d";
const CLUB_URL = "https://nihongotracker.app/clubs/6951b8e3319c4aea0d5d2b2d";
const ITEMS_PER_PAGE = 10;

const PERIOD_LABELS = {
  "week":     "This Week",
  "month":    "This Month",
  "all-time": "All Time"
};

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function formatNumber(n) {
  return Number(n).toLocaleString("en-US");
}

function formatHours(minutes) {
  return `${(minutes / 60).toFixed(1)}h`;
}

async function fetchRankings(period = "month", page = 1) {
  const offset = (page - 1) * ITEMS_PER_PAGE;
  const { data } = await axios.get(`${API_BASE}/clubs/${CLUB_ID}/rankings`, {
    params: { period, limit: ITEMS_PER_PAGE, offset }
  });
  return data;
}

function buildEmbed({ rankings, period, page, totalPages, totalMembers, requestingUser }) {
  const periodLabel = PERIOD_LABELS[period] || "This Month";

  const lines = rankings.map((entry) => {
    const rank = entry.rank;
    const prefix = rank <= 3 ? RANK_MEDALS[rank - 1] : `\`${rank}\``;
    const username = entry.user?.username ?? "Unknown";
    const level = entry.user?.stats?.userLevel ?? "?";
    const xp = formatNumber(entry.totalXp);
    const hours = formatHours(entry.totalTime);
    const logs = formatNumber(entry.totalLogs);

    return `${prefix}  **${username}**  ·  Lv. ${level}\n` +
           `\u200b \u200b \u200b \u200b${xp} XP  ·  ${hours}  ·  ${logs} logs`;
  });

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`Rankings — ${periodLabel}`)
    .setDescription(lines.join("\n\n") || "No data for this period.")
    .setFooter({
      text: `Page ${page} of ${totalPages}  ·  ${totalMembers} members  ·  ${CLUB_URL}`,
      iconURL: requestingUser.displayAvatarURL({ dynamic: true })
    })
    .setTimestamp();
}

function buildComponents(period, page, totalPages) {
  const periodRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ranking_period:${page}`)
      .setPlaceholder("Period")
      .addOptions([
        { label: "This Week",  value: "week",     default: period === "week" },
        { label: "This Month", value: "month",    default: period === "month" },
        { label: "All Time",   value: "all-time", default: period === "all-time" }
      ])
  );

  const rows = [periodRow];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ranking_page:${period}`)
          .setPlaceholder(`Page ${page} of ${totalPages}`)
          .addOptions(
            Array.from({ length: totalPages }, (_, i) => ({
              label: `Page ${i + 1}`,
              value: String(i + 1),
              default: page === i + 1
            }))
          )
      )
    );
  }

  return rows;
}

async function sendRanking(interaction, period, page) {
  let data;
  try {
    data = await fetchRankings(period, page);
  } catch (err) {
    console.error("Rankings fetch error:", err.response?.status, err.response?.data);
    return interaction.editReply({ content: "Failed to fetch rankings.", ephemeral: true });
  }

  const rankings = data.rankings ?? [];
  const total = data.pagination?.total ?? rankings.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  return interaction.editReply({
    embeds: [buildEmbed({ rankings, period, page: safePage, totalPages, totalMembers: total, requestingUser: interaction.user })],
    components: buildComponents(period, safePage, totalPages)
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Show club rankings"),

  async execute(interaction) {
    await interaction.deferReply();
    await sendRanking(interaction, "month", 1);
  },

  async handleSelect(interaction) {
    await interaction.deferUpdate();
    const [action, param] = interaction.customId.split(":");
    const selected = interaction.values[0];

    if (action === "ranking_period") {
      await sendRanking(interaction, selected, parseInt(param) || 1);
    } else if (action === "ranking_page") {
      await sendRanking(interaction, param, parseInt(selected) || 1);
    }
  }
};