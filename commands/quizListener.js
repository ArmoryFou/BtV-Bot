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

export default function quizListener(client) {
  client.on('messageCreate', async (message) => {
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
      const failures = [];

      const participant = data.participants?.[0];
      const userId = participant?.discordUser?.id;
      const userName = participant?.discordUser?.username ?? 'Desconocido';

      if (data.participants?.length === QUIZ_RULES.participants)
        results.push('✅ Participantes OK');
      else failures.push('❌ Participantes incorrectos');

      if (data.settings?.scoreLimit === QUIZ_RULES.scoreLimit)
        results.push('✅ Score limit OK');
      else failures.push('❌ Score limit incorrecto');

      if (data.decks?.[0]?.shortName === QUIZ_RULES.deckShortName)
        results.push('✅ Deck correcto');
      else failures.push('❌ Deck incorrecto');

      const aliases = data.settings?.inlineSettings?.aliases ?? [];
      if (!QUIZ_RULES.noDelay || aliases.includes('nodelay'))
        results.push('✅ No delay');
      else failures.push('❌ No delay no activado');

      if (data.settings?.maxMissedQuestions === QUIZ_RULES.maxMissedQuestions)
        results.push('✅ Max missed questions OK');
      else failures.push('❌ Max missed questions incorrecto');

      if (!QUIZ_RULES.hardcore || data.rawStartCommand?.includes('hardcore'))
        results.push('✅ Hardcore');
      else failures.push('❌ Hardcore no activado');

      const atl =
        data.settings?.answerTimeLimitInMs
          ? data.settings.answerTimeLimitInMs / 1000
          : data.settings?.inlineSettings?.answerTimeLimit;

      if (atl === QUIZ_RULES.answerTimeLimit)
        results.push('✅ Answer time limit OK');
      else failures.push('❌ Answer time limit incorrecto');

      const effect =
        data.settings?.effect ?? data.settings?.inlineSettings?.effect;

      if (effect === QUIZ_RULES.effect)
        results.push('✅ Effect correcto');
      else failures.push('❌ Effect incorrecto');

      if (QUIZ_RULES.requireWin) {
        const score = data.scores?.[0]?.score ?? 0;
        if (score >= QUIZ_RULES.scoreLimit)
          results.push('✅ Ganó el quiz');
        else failures.push('❌ No ganó el quiz');
      }

      const passed = failures.length === 0;

      let msg = `🧠 **Resultado del quiz de ${userName}**\n\n`;
      msg += results.join('\n') + '\n\n';
      if (failures.length)
        msg += '⚠️ **Faltó cumplir:**\n' + failures.join('\n') + '\n\n';
      msg += passed ? '🎉 **QUIZ ACEPTADO**' : '❌ **QUIZ RECHAZADO**';

      await message.channel.send(msg);

      if (passed && userId && message.guild) {
        const member = await message.guild.members.fetch(userId);
        if (!member.roles.cache.has(PASS_ROLE_ID)) {
          await member.roles.add(PASS_ROLE_ID);
        }
      }

    } catch (err) {
      console.error('💥 Error quiz:', err);
    }
  });
}
