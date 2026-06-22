const axios = require("axios");
const crypto = require("crypto");

const API_BASE = "https://nihongotracker.app/api";
const CLUB_ID = "6951b8e3319c4aea0d5d2b2d";
const READING_TYPES = new Set(["reading", "manga", "vn"]);
const SPAIN_TIME_ZONE = "Europe/Madrid";
const MEXICO_TIME_ZONE = "America/Mexico_City";

function parseDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null;

  return { year: Number(year), month: Number(month), day: Number(day) };
}

function toDateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextDate(dateParts) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getOffsetMinutes(timeZone, referenceDate) {
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset"
  }).formatToParts(referenceDate).find(part => part.type === "timeZoneName")?.value;

  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(timeZoneName || "");
  if (!match) throw new Error(`No se pudo obtener el offset de ${timeZone}.`);

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function zonedMidnightToUtc(dateParts, timeZone) {
  const noonUtc = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12));
  const offset = getOffsetMinutes(timeZone, noonUtc);
  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) - offset * 60_000);
}

function buildWindow(dateInput) {
  const date = typeof dateInput === "string" ? parseDate(dateInput) : dateInput;
  if (!date) throw new Error("Usa la fecha con formato DD/MM/AAAA.");

  const startAt = zonedMidnightToUtc(date, SPAIN_TIME_ZONE);
  const endAt = zonedMidnightToUtc(nextDate(date), MEXICO_TIME_ZONE);

  return { date: toDateKey(date), startAt, endAt };
}

function createReadathonDocument({ date, targetHours, guildId = null, channelId = null, createdBy = null }) {
  const targetMinutes = Math.round(Number(targetHours) * 60);
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    throw new Error("La meta debe ser un número de horas mayor que 0.");
  }

  const window = buildWindow(date);
  const now = new Date();
  const status = now < window.startAt ? "scheduled" : now >= window.endAt ? "finished" : "active";
  const id = crypto.randomUUID().split("-")[0];

  return {
    _id: `readathon:${id}`,
    kind: "readathon",
    readathonId: id,
    date: window.date,
    startAt: window.startAt,
    endAt: window.endAt,
    targetMinutes,
    status,
    guildId,
    channelId,
    messageId: null,
    createdBy,
    manualContributions: [],
    totals: { minutes: 0, contributors: [] },
    createdAt: now,
    updatedAt: now
  };
}

async function createReadathon(db, options) {
  const event = createReadathonDocument(options);
  await db.insertOne(event);
  return event;
}

async function getReadathon(db, id) {
  return db.findOne({ _id: `readathon:${id}` });
}

async function listReadathons(db) {
  return db.find({ kind: "readathon" }).sort({ startAt: -1 }).toArray();
}

async function fetchClubMembers() {
  const members = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data } = await axios.get(`${API_BASE}/clubs/${CLUB_ID}/rankings`, {
      params: { period: "all-time", limit, offset }
    });
    const rankings = Array.isArray(data?.rankings) ? data.rankings : [];
    members.push(...rankings.map(entry => entry.user).filter(user => user?.username));

    const total = data?.pagination?.total;
    if (rankings.length < limit || (Number.isFinite(total) && offset + rankings.length >= total)) break;
    offset += rankings.length;
  }

  return [...new Map(members.map(member => [member.username.toLowerCase(), member])).values()];
}

async function fetchUserLogs(username, startAt, endAt) {
  const logs = [];
  const limit = 100;

  for (let page = 1; page <= 50; page++) {
    const { data } = await axios.get(`${API_BASE}/users/${encodeURIComponent(username)}/logs`, {
      params: { page, limit }
    });
    if (!Array.isArray(data) || data.length === 0) break;

    logs.push(...data);
    const oldestDate = new Date(data[data.length - 1]?.date);
    if (data.length < limit || Number.isNaN(oldestDate.getTime()) || oldestDate < startAt) break;
  }

  return logs.filter(log => {
    const logDate = new Date(log.date);
    return (
      READING_TYPES.has(log.type) &&
      Number(log.time) > 0 &&
      logDate >= startAt &&
      logDate < endAt
    );
  });
}

async function mapDiscordUsers(db, usernames) {
  const links = await db.find(
    { nihongoUsername: { $in: usernames } },
    { projection: { discordId: 1, nihongoUsername: 1 } }
  ).toArray();

  return new Map(links.map(link => [link.nihongoUsername.toLowerCase(), link.discordId]));
}

async function calculateTotals(db, event) {
  const members = await fetchClubMembers();
  const discordUsers = await mapDiscordUsers(db, members.map(member => member.username));
  const contributors = new Map();

  for (let index = 0; index < members.length; index += 5) {
    const batch = members.slice(index, index + 5);
    const results = await Promise.all(batch.map(async member => {
      const logs = await fetchUserLogs(member.username, new Date(event.startAt), new Date(event.endAt));
      return { member, minutes: logs.reduce((total, log) => total + Number(log.time), 0) };
    }));

    for (const { member, minutes } of results) {
      if (minutes <= 0) continue;
      const usernameKey = member.username.toLowerCase();
      const discordId = discordUsers.get(usernameKey) ?? null;
      const key = discordId || usernameKey;
      contributors.set(key, {
        username: member.username,
        discordId,
        avatar: member.avatar ?? null,
        minutes
      });
    }
  }

  for (const contribution of event.manualContributions ?? []) {
    const key = contribution.discordId || contribution.username?.toLowerCase() || crypto.randomUUID();
    const existing = contributors.get(key) ?? {
      username: contribution.username || "Prueba manual",
      discordId: contribution.discordId || null,
      avatar: null,
      minutes: 0
    };
    existing.minutes += Number(contribution.minutes) || 0;
    contributors.set(key, existing);
  }

  const sorted = [...contributors.values()]
    .filter(contributor => contributor.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  return {
    minutes: sorted.reduce((total, contributor) => total + contributor.minutes, 0),
    contributors: sorted
  };
}

function getStatus(event, now = new Date()) {
  if (event.status === "completed" || event.status === "cancelled") return event.status;
  if (event.totals?.minutes >= event.targetMinutes) return "completed";
  if (now >= new Date(event.endAt)) return "finished";
  if (now < new Date(event.startAt)) return "scheduled";
  return "active";
}

async function refreshReadathon(db, id) {
  const event = await getReadathon(db, id);
  if (!event) throw new Error("Readathon no encontrado.");
  if (["completed", "cancelled"].includes(event.status)) return event;

  if (new Date() < new Date(event.startAt)) {
    const updatedAt = new Date();
    await db.updateOne(
      { _id: event._id },
      { $set: { status: "scheduled", updatedAt } }
    );
    return { ...event, status: "scheduled", updatedAt };
  }

  const totals = await calculateTotals(db, event);
  const status = getStatus({ ...event, totals });
  const updatedAt = new Date();

  await db.updateOne(
    { _id: event._id },
    { $set: { totals, status, updatedAt } }
  );

  return { ...event, totals, status, updatedAt };
}

async function addManualHours(db, id, contribution) {
  const minutes = Math.round(Number(contribution.hours) * 60);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Las horas deben ser mayores que 0.");

  const event = await getReadathon(db, id);
  if (!event) throw new Error("Readathon no encontrado.");

  await db.updateOne(
    { _id: event._id },
    {
      $push: {
        manualContributions: {
          discordId: contribution.discordId || null,
          username: contribution.username || null,
          minutes,
          createdAt: new Date()
        }
      },
      $set: { updatedAt: new Date() }
    }
  );

  return refreshReadathon(db, id);
}

async function finishReadathon(db, id) {
  const event = await getReadathon(db, id);
  if (!event) throw new Error("Readathon no encontrado.");

  const totals = await calculateTotals(db, event);
  const status = totals.minutes >= event.targetMinutes ? "completed" : "finished";
  const updatedAt = new Date();

  await db.updateOne(
    { _id: event._id },
    { $set: { totals, status, finishedAt: updatedAt, updatedAt } }
  );

  return { ...event, totals, status, finishedAt: updatedAt, updatedAt };
}

function formatHours(minutes) {
  return `${(minutes / 60).toFixed(1)} h`;
}

function progressBar(current, target, width = 18) {
  const ratio = target > 0 ? Math.min(current / target, 1) : 0;
  const filled = Math.round(ratio * width);
  return `\`${"█".repeat(filled)}${"░".repeat(width - filled)}\``;
}

function topContributors(event) {
  const top = event.totals?.contributors?.slice(0, 3) ?? [];
  if (top.length === 0) return "Aún no hay aportaciones.";

  return top.map((contributor, index) => {
    const name = contributor.discordId ? `<@${contributor.discordId}>` : contributor.username;
    return `${index + 1}. ${name} — ${formatHours(contributor.minutes)}`;
  }).join("\n");
}

function buildEmbedData(event) {
  const total = event.totals?.minutes ?? 0;
  const status = getStatus(event);
  const completed = status === "completed";
  const finished = status === "finished";
  const title = completed ? "Readathon completado" : finished ? "Readathon finalizado" : "Readathon";
  const description = completed
    ? "Se ha completado la barra."
    : finished
      ? "El periodo del readathon ha terminado."
      : `Desde <t:${Math.floor(new Date(event.startAt).getTime() / 1000)}:F> (00:00 España) hasta <t:${Math.floor(new Date(event.endAt).getTime() / 1000)}:F> (00:00 Ciudad de México).`;

  return {
    color: completed ? 0x2F855A : finished ? 0x6B7280 : 0x2563EB,
    title,
    description,
    fields: [
      {
        name: "Progreso",
        value: `${progressBar(total, event.targetMinutes)}\n${formatHours(total)} de ${formatHours(event.targetMinutes)}`
      },
    ],
    footer: `Readathon ${event.date} · Solo lectura, manga y novelas visuales`,
    timestamp: event.updatedAt || event.createdAt
  };
}

function formatReadathonText(event) {
  const total = event.totals?.minutes ?? 0;
  return [
    `${buildEmbedData(event).title} (${event.readathonId})`,
    `${progressBar(total, event.targetMinutes)}`,
    `${formatHours(total)} de ${formatHours(event.targetMinutes)}`,
    ...( ["completed", "finished"].includes(getStatus(event)) ? [topContributors(event)] : [] )
  ].join("\n");
}

module.exports = {
  addManualHours,
  buildEmbedData,
  buildWindow,
  calculateTotals,
  createReadathon,
  finishReadathon,
  formatReadathonText,
  getReadathon,
  listReadathons,
  parseDate,
  refreshReadathon
};
