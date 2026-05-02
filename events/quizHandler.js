import { Events, ChannelType } from 'discord.js'; // Importamos ChannelType
import { generateQuizImage, cleanupTempImage } from './imageGenerator.js';

console.log('========================================');
console.log('✅ QUIZ HANDLER CARGADO CORRECTAMENTE');
console.log('========================================');

const TARGET_CHANNEL_IDS = ['1464692992781717841', '1499999880897364150'];
const KOTOBA_BOT_ID = '251239170058616833';
const CONGRATS_CHANNEL_ID = '1364570564320296971';

const LEVEL_CONFIG = {
  btv1: { level: 1, roleId: '1380328037840715797' },
  btv2: { level: 2, roleId: '1499959078137499648' },
  btv3: { level: 3, roleId: '1499962514216321024' },
  btv4: { level: 4, roleId: '1499962921235517530' },
  btv5: { level: 5, roleId: '1499963073459392532' },
  btv6: { level: 6, roleId: '1499963271808155821' },
  btv7: { level: 7, roleId: '1499963432835874888' },
  btv8: { level: 8, roleId: '1499963600104587344' },
  btv9: { level: 9, roleId: '1499963714181267557' },
};

const QUIZ_RULES = {
  participants: 1,
  scoreLimit: 50,
  noDelay: true,
  maxMissedQuestions: 5,
  hardcore: true,
  answerTimeLimit: 10,
  effect: 'antiocr',
};

export default {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      // ── VALIDACIÓN DE CANAL (INCLUYENDO HILOS) ─────────────────────
      let isInTargetChannel = false;
      if (TARGET_CHANNEL_IDS.includes(message.channel.id)) {
        isInTargetChannel = true;
      } else if (message.channel.isThread()) {
        if (TARGET_CHANNEL_IDS.includes(message.channel.parentId)) {
          isInTargetChannel = true;
        }
      }
      if (!isInTargetChannel) return;

      if (message.author.id !== KOTOBA_BOT_ID) return;
      if (!message.embeds?.length) return;

      const embed = message.embeds[0];
      const title = embed.title || '';
      if (!title.includes('Quiz Ended') && !title.includes('Ended')) return;

      const reportField = embed.fields?.find(
        (f) =>
          (f.name === 'Game Report' || f.name?.includes('Report')) &&
          f.value.includes('kotobaweb.com'),
      );
      if (!reportField) return;

      const match = reportField.value.match(/\((https?:\/\/[^)]+)\)/);
      if (!match) return;

      const apiUrl = match[1].replace('/dashboard/', '/api/');
      const res = await fetch(apiUrl);
      if (!res.ok) return;

      const data = await res.json();
      const deckShortName = data.decks?.[0]?.shortName;
      const config = LEVEL_CONFIG[deckShortName];

      if (!config) return;

      const participant = data.participants?.[0];
      const userId = participant?.discordUser?.id;
      const userName = participant?.discordUser?.username ?? 'Desconocido';
      const score = data.scores?.[0]?.score ?? 0;

      // --- Validaciones de Reglas ---
      const settings = data.settings || {};
      const inline = settings.inlineSettings || {};
      const expectedScoreLimit =
        config.level === 1 ? 25 : QUIZ_RULES.scoreLimit;
      const expectedMaxMissedQuestions =
        config.level === 1
          ? 5
          : config.level <= 6
            ? 10
            : QUIZ_RULES.maxMissedQuestions;
      const checks = [
        data.participants?.length === QUIZ_RULES.participants,
        (settings.scoreLimit ?? inline.scoreLimit) === expectedScoreLimit,
        score >= expectedScoreLimit,
        (settings.effect ?? inline.effect) === QUIZ_RULES.effect,
        (settings.maxMissedQuestions ?? inline.maxMissedQuestions) ===
          expectedMaxMissedQuestions,
      ];
      const allPassed = checks.every(Boolean);

      // --- Si NO pasó, no hacemos nada más ---
      if (!allPassed) return;

      if (!message.guild || !userId) return;

      // ── NUEVA VERIFICACIÓN DE ROL EXISTENTE ─────────────────────────
      // Obtenemos al miembro del servidor
      const member = await message.guild.members
        .fetch(userId)
        .catch(() => null);
      if (!member) return;

      // Comprobamos si ya tiene el rol configurado para este nivel
      if (member.roles.cache.has(config.roleId)) {
        // Si ya lo tiene, enviamos mensaje simple y SALIMOS (return)
        await message.channel.send(
          `¡Buen intento <@${userId}>! Veo que ya posees el rol de este nivel, así que no se generará una nueva felicitación.`,
        );
        return; // Importante: esto detiene todo el código de abajo
      }
      // ────────────────────────────────────────────────────────────────

      // --- Obtener Nombre del Rol y Avatar ---
      let roleName = `Nivel ${config.level}`;
      let avatarUrl = 'none';

      const role = await message.guild.roles
        .fetch(config.roleId)
        .catch(() => null);
      if (role) roleName = role.name;
      avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });

      // --- Generar Imagen ---
      const imagePath = await generateQuizImage({
        level: config.level,
        avatarUrl,
        roleName,
        passed: true, // Ya sabemos que pasó por el if(!allPassed) de arriba
        score,
        maxScore: expectedScoreLimit,
        username: userName,
      }).catch(() => null);

      // --- Enviar a Canal de Quiz (Donde se hizo el quiz) ---
      const resultMsg = `🎉 **¡QUIZ ACEPTADO!** ${userName} ha superado ${roleName}.`;
      const payload = { content: resultMsg };
      // Aunque allPassed es true, imagePath podría ser null si falló la generación
      if (imagePath) payload.files = [imagePath];

      await message.channel.send(payload);

      // --- Otorgar Rol ---
      await member.roles.add(config.roleId).catch(() => {});

      // --- Enviar a Felicitaciones ---
      const congratsChannel = await message.guild.channels
        .fetch(CONGRATS_CHANNEL_ID)
        .catch(() => null);
      if (congratsChannel) {
        const congratsPayload = {
          content: `🎊 **¡Nueva victoria!** <@${userId}> ha alcanzado el rango de **${roleName}**.`,
        };
        if (imagePath) congratsPayload.files = [imagePath];
        await congratsChannel.send(congratsPayload);
      }

      if (imagePath) cleanupTempImage(imagePath);
    } catch (err) {
      console.error('💥 Error en quiz handler:', err);
    }
  },
};
