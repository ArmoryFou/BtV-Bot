const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const API_BASE = "https://nihongotracker.app/api";

const TYPE_MAP = {
  anime: "anime",
  manga: "manga",
  reading: "reading",
  visual_novel: "vn",
  vn: "vn",
  video_game: "video_game",
  video: "video",
  movie: "movie",
  tv_show: "tv_show",
  audio: "audio"
};

const ENDPOINT_MAP = {
  anime: "media/anime",
  manga: "media/manga",
  reading: "media/reading",
  video_game: "media/video_game",
  video: "media/video",
  movie: "media/movie",
  tv_show: "media/tv_show",
  audio: "media/audio",
  vn: "media/vn"
};

const TYPE_COLORS = {
  anime:      0x3B82F6,
  manga:      0xF59E0B,
  reading:    0x10B981,
  vn:         0x8B5CF6,
  video_game: 0xEF4444,
  movie:      0xEC4899,
  tv_show:    0x06B6D4,
  audio:      0x6B7280,
};

const TYPE_LABELS = {
  anime:      "🎌 Anime",
  manga:      "📚 Manga",
  reading:    "📖 Lectura",
  vn:         "🎮 Novela Visual",
  video_game: "🕹️ Videojuego",
  movie:      "🎬 Película",
  tv_show:    "📺 Serie",
  audio:      "🎧 Audio",
};

const getHeaders = (apiKey) => ({
  "X-API-Key": apiKey,
  "Content-Type": "application/json",
  "Accept": "application/json"
});

function mapQuantity(apiType, quantity) {
  switch (apiType) {
    case "anime":      return { episodes: quantity, pages: 0, chars: 0, time: 0 };
    case "manga":      return { episodes: 0, pages: quantity, chars: 0, time: 0 };
    case "reading":    return { episodes: 0, pages: 0, chars: quantity, time: 0 };
    case "vn":         return { episodes: 0, pages: 0, chars: quantity, time: 0 };
    case "video_game": return { episodes: 0, pages: 0, chars: 0, time: quantity };
    case "movie":      return { episodes: 0, pages: 0, chars: 0, time: quantity };
    case "tv_show":    return { episodes: 0, pages: 0, chars: 0, time: quantity };
    default:           return { episodes: quantity, pages: 0, chars: 0, time: 0 };
  }
}

function formatNumber(n) {
  return n.toLocaleString("es-MX");
}

function formatTime(minutes) {
  if (minutes >= 60) {
    return `${formatNumber(minutes)} min (${(minutes / 60).toFixed(1)}h)`;
  }
  return `${formatNumber(minutes)} min`;
}

function fuzzyScore(query, m) {
  const q = query.toLowerCase();
  const fields = [
    m.title?.contentTitleEnglish,
    m.title?.contentTitleRomaji,
    m.title?.contentTitleNative,
    ...(m.synonyms || []),
    String(m.contentId)
  ].map(f => (f || "").toLowerCase());

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (field === q) return 100;
    if (field.startsWith(q)) best = Math.max(best, 90);
    if (field.includes(q)) best = Math.max(best, 70);
    let i = 0;
    for (const c of field) {
      if (c === q[i]) i++;
      if (i === q.length) { best = Math.max(best, 50); break; }
    }
  }
  return best;
}

function buildEmbed({ media, apiType, mapped, description, tags, xp, isPrivate, user }) {
  const title =
    media?.title?.contentTitleEnglish ||
    media?.title?.contentTitleRomaji ||
    media?.title?.contentTitleNative ||
    "Desconocido";

  const color = TYPE_COLORS[apiType] ?? 0x5865F2;
  const typeLabel = TYPE_LABELS[apiType] ?? apiType;

  const statsFields = [];

  if (mapped.episodes > 0)
    statsFields.push({ name: "📺 Episodios", value: `${formatNumber(mapped.episodes)}`, inline: true });
  if (mapped.pages > 0)
    statsFields.push({ name: "📄 Páginas", value: `${formatNumber(mapped.pages)}`, inline: true });
  if (mapped.chars > 0)
    statsFields.push({ name: "🔤 Caracteres", value: `${formatNumber(mapped.chars)}`, inline: true });
  if (mapped.time > 0)
    statsFields.push({ name: "⏱️ Tiempo", value: formatTime(mapped.time), inline: true });
  if (xp > 0)
    statsFields.push({ name: "✨ XP", value: `+${formatNumber(xp)}`, inline: true });
  if (tags.length > 0)
    statsFields.push({ name: "🏷️ Etiquetas", value: tags.map(t => `\`${t}\``).join(" "), inline: false });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${user.username} registró ${typeLabel}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setTitle(title)
    .setThumbnail(media?.contentImage || null)
    .setDescription(description || null)
    .addFields(statsFields)
    .setFooter({ text: isPrivate ? "🔒 Log privado" : "nihongotracker.app" })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Registra tu inmersión en japonés")

    .addStringOption(o =>
      o.setName("tipo")
        .setDescription("Tipo de contenido")
        .setRequired(true)
        .addChoices(
          { name: "Anime",         value: "anime" },
          { name: "Manga",         value: "manga" },
          { name: "Lectura",       value: "reading" },
          { name: "Novela Visual", value: "visual_novel" },
          { name: "Videojuego",    value: "video_game" },
          { name: "Película",      value: "movie" },
          { name: "Serie",         value: "tv_show" }
        )
    )

    .addStringOption(o =>
      o.setName("titulo")
        .setDescription("Busca y selecciona el título")
        .setRequired(true)
        .setAutocomplete(true)
    )

    .addIntegerOption(o =>
      o.setName("cantidad")
        .setDescription("Episodios / Páginas / Caracteres / Minutos según el tipo (0 si no aplica)")
        .setRequired(true)
    )

    .addIntegerOption(o =>
      o.setName("paginas")
        .setDescription("Páginas extra (opcional)")
    )

    .addIntegerOption(o =>
      o.setName("caracteres")
        .setDescription("Caracteres extra (opcional)")
    )

    .addIntegerOption(o =>
      o.setName("tiempo")
        .setDescription("Tiempo extra en minutos (opcional)")
    )

    .addStringOption(o =>
      o.setName("descripcion")
        .setDescription("Descripción o comentario opcional")
    )

    .addStringOption(o =>
      o.setName("etiquetas")
        .setDescription("Etiquetas separadas por comas")
    )

    .addBooleanOption(o =>
      o.setName("privado")
        .setDescription("Hacer el log privado")
    ),

  // ================= AUTOCOMPLETE =================
  async autocomplete(interaction) {
    const focused  = interaction.options.getFocused();
    const typeRaw  = interaction.options.getString("tipo");

    if (!focused || !typeRaw) return interaction.respond([]);

    const apiType = TYPE_MAP[typeRaw];
    if (!apiType) return interaction.respond([]);

    try {
      const { data } = await axios.get(`${API_BASE}/media/search`, {
        params: { search: focused, type: apiType }
      });

      if (!Array.isArray(data)) return interaction.respond([]);

      return interaction.respond(
        data
          .map(m => ({ m, score: fuzzyScore(focused, m) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 25)
          .map(({ m }) => ({
            name:
              m.title?.contentTitleEnglish ||
              m.title?.contentTitleRomaji ||
              m.title?.contentTitleNative ||
              "Desconocido",
            value: String(m.contentId)
          }))
      );
    } catch {
      return interaction.respond([]);
    }
  },

  // ================= EXECUTE =================
  async execute(interaction) {
    await interaction.deferReply();

    const typeRaw     = interaction.options.getString("tipo");
    const id          = interaction.options.getString("titulo");
    const quantity    = interaction.options.getInteger("cantidad");
    const tags        = (interaction.options.getString("etiquetas") || "")
      .split(",").map(t => t.trim()).filter(Boolean);
    const description = interaction.options.getString("descripcion") || null;
    const isPrivate   = interaction.options.getBoolean("privado") ?? false;

    const apiType  = TYPE_MAP[typeRaw];
    const endpoint = ENDPOINT_MAP[apiType];

    if (!endpoint)
      return interaction.editReply({ content: "Tipo de contenido no válido." });

    // ================= CHECK CUENTA VINCULADA =================
    const userDoc = await interaction.client.db.findOne({ discordId: interaction.user.id });

    if (!userDoc?.apiKey) {
      const embedNoLinkeado = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ Cuenta no vinculada")
        .setDescription(
          "Necesitas vincular tu cuenta antes de poder registrar inmersión.\n\n" +
          "Usa **/link** para conectar tu cuenta de nihongotracker.app."
        )
        .setFooter({ text: "nihongotracker.app" });

      return interaction.editReply({ embeds: [embedNoLinkeado] });
    }

    // ================= FETCH MEDIA =================
    let media;

    try {
      const url = `${API_BASE}/${endpoint}/${id}`;
      console.log("Fetching media URL:", url);

      const { data } = await axios.get(url, { headers: getHeaders(userDoc.apiKey) });
      media = data;
    } catch (err) {
      console.error("Media fetch error:", err.response?.status, err.response?.data);
      return interaction.editReply({ content: "No se encontró el contenido. Comprueba el título y el tipo." });
    }

    // ================= MAP QUANTITY =================
    const mapped = mapQuantity(apiType, quantity);
    mapped.pages += interaction.options.getInteger("paginas")    || 0;
    mapped.chars += interaction.options.getInteger("caracteres") || 0;
    mapped.time  += interaction.options.getInteger("tiempo")     || 0;

    // ================= BODY =================
    const resolvedDescription = description ?? (
      media?.title?.contentTitleNative ||
      media?.title?.contentTitleEnglish ||
      media?.title?.contentTitleRomaji ||
      id
    );

    const body = {
      type: apiType,
      mediaId: id,
      media: {
        contentId: id,
        contentImage: media?.contentImage || "",
        title: {
          contentTitleNative:  media?.title?.contentTitleNative  || "",
          contentTitleEnglish: media?.title?.contentTitleEnglish || "",
          contentTitleRomaji:  media?.title?.contentTitleRomaji  || ""
        },
        type: apiType
      },
      description: resolvedDescription,
      episodes: mapped.episodes,
      pages:    mapped.pages,
      chars:    mapped.chars,
      time:     mapped.time,
      date:     new Date().toISOString(),
      private:  isPrivate,
      tags
    };

    console.log("Sending body:", JSON.stringify(body, null, 2));

    // ================= POST LOG =================
    let logResponse;

    try {
      const { data } = await axios.post(`${API_BASE}/logs`, body, {
        headers: getHeaders(userDoc.apiKey)
      });
      logResponse = data;
    } catch (err) {
      console.error(err.response?.status, JSON.stringify(err.response?.data, null, 2));
      return interaction.editReply({ content: "No se pudo crear el log. Inténtalo de nuevo." });
    }

    // ================= EMBED =================
    const xp = logResponse?.xp ?? 0;

    const embed = buildEmbed({
      media,
      apiType,
      mapped,
      description: resolvedDescription,
      tags,
      xp,
      isPrivate,
      user: interaction.user
    });

    return interaction.editReply({ embeds: [embed] });
  }
};