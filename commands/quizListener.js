import { Events } from 'discord.js';

const TARGET_CHANNEL_ID = '1464692992781717841';
const KOTOBA_BOT_ID = '251239170058616833';
const PASS_ROLE_ID = '1464707866631078020';

const QUIZ_RULES = {
  participants: 1,
  scoreLimit: 25,
  deckShortName: 'n2',
  noDelay: true,
  maxMissedQuestions: 5,
  hardcore: true,
  answerTimeLimit: 10,
  effect: 'antiocr',
  requireWin: true
};

export default {
  name: Events.MessageCreate,

  async execute(message) {
    try {
      if (message.channel.id !== TARGET_CHANNEL_ID) return;
      if (message.author.id !== KOTOBA_BOT_ID) return;
      if (!message.embeds.length) return;

      const embed = message.embeds[0];
      if (!embed.title || !embed.title.includes('Quiz Ended')) return;

      const reportField = embed.fields?.find(
        f => f.name === 'Game Report' && f.value.includes('kotobaweb.com')
      );
      if (!reportField) return;

      const match = reportField.value.match(/\((https?:\/\/[^)]+)\)/);
      if (!match) return;

      const apiUrl = match[1].replace('/dashboard/', '/api/');
      const res = await fetch(apiUrl);
      if (!res.ok) return;

      const data = await res.json();

      const results = [];

      const settings = data.settings ?? {};
      const inlineSettings = settings.inlineSettings ?? {};
      const scoreLimit = settings.scoreLimit ?? inlineSettings.scoreLimit;
      const maxMissedQuestions =
        settings.maxMissedQuestions ?? inlineSettings.maxMissedQuestions;
      const effect = settings.effect ?? inlineSettings.effect;
      const aliases = inlineSettings.aliases ?? [];
      const rawStartCommand = data.rawStartCommand ?? settings.rawStartCommand;
      const answerTimeLimit = settings.answerTimeLimitInMs != null
        ? settings.answerTimeLimitInMs / 1000
        : inlineSettings.answerTimeLimit;

      const participant = data.participants?.[0];
      const userId = participant?.discordUser?.id;
      const userName = participant?.discordUser?.username ?? 'Desconocido';
      const participantId = participant?._id;
      const score =
        data.scores?.find((entry) => entry.user === participantId)?.score ??
        data.scores?.[0]?.score ??
        0;

      if (data.participants?.length === QUIZ_RULES.participants)
        results.push('✅ Participantes OK');

      if (scoreLimit === QUIZ_RULES.scoreLimit)
        results.push('✅ Score limit OK');

      if (data.decks?.[0]?.shortName === QUIZ_RULES.deckShortName)
        results.push('✅ Deck correcto');

      if (!QUIZ_RULES.noDelay || aliases.includes('nodelay'))
        results.push('✅ No delay');

      if (maxMissedQuestions === QUIZ_RULES.maxMissedQuestions)
        results.push('✅ Max missed questions OK');

      if (!QUIZ_RULES.hardcore || rawStartCommand?.includes('hardcore'))
        results.push('✅ Hardcore');

      if (answerTimeLimit === QUIZ_RULES.answerTimeLimit)
        results.push('✅ Answer time limit OK');

      if (effect === QUIZ_RULES.effect)
        results.push('✅ Effect correcto');

      if (QUIZ_RULES.requireWin) {
        if (score >= QUIZ_RULES.scoreLimit)
          results.push('✅ Ganó el quiz');
      }

      const allChecksPassed =
        data.participants?.length === QUIZ_RULES.participants &&
        scoreLimit === QUIZ_RULES.scoreLimit &&
        data.decks?.[0]?.shortName === QUIZ_RULES.deckShortName &&
        (!QUIZ_RULES.noDelay || aliases.includes('nodelay')) &&
        maxMissedQuestions === QUIZ_RULES.maxMissedQuestions &&
        (!QUIZ_RULES.hardcore || rawStartCommand?.includes('hardcore')) &&
        answerTimeLimit === QUIZ_RULES.answerTimeLimit &&
        effect === QUIZ_RULES.effect &&
        (!QUIZ_RULES.requireWin || score >= QUIZ_RULES.scoreLimit);

      let msg = `🧠 **Resultado del quiz de ${userName}**\n\n`;
      msg += results.join('\n') + '\n\n';
      msg += allChecksPassed ? '🎉 **QUIZ ACEPTADO**' : '❌ **QUIZ RECHAZADO**';

      await message.channel.send(msg);

      if (allChecksPassed && userId && message.guild) {
        const member = await message.guild.members.fetch(userId);
        if (!member.roles.cache.has(PASS_ROLE_ID)) {
          await member.roles.add(PASS_ROLE_ID);
        }
      }

    } catch (err) {
      console.error('💥 Error quiz:', err);
    }
  }
};
