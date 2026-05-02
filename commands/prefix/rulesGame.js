import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags
} from "discord.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rulesPath = path.join(__dirname, "../../info/rules.json");
const rulesData = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));

const GAME_PREFIX = "!regla";
const MIN_PLAYERS = 3;
const games = new Map();

export default {
  name: Events.MessageCreate,

  async execute(message) {

    if (!message.guild || message.author.bot) return;

    // 🛑 STOP GLOBAL
    if (message.content === "!reglastop") {

      if (!games.has(message.guild.id))
        return message.reply("No hay partida activa.");

      games.delete(message.guild.id);
      return message.channel.send("🛑 El juego fue detenido completamente.");
    }

    if (!message.content.startsWith(GAME_PREFIX)) return;

    if (games.has(message.guild.id)) {
      return message.reply("⚠️ Ya hay una partida en curso en este servidor.");
    }

    const game = {
      players: new Map(),
      started: false,
      turnIndex: 0,
      turnOrder: [],
      channel: message.channel,
      hostId: message.author.id
    };

    games.set(message.guild.id, game);

    const embed = new EmbedBuilder()
      .setTitle("🎮 Juego de Reglas Secretas")
      .setDescription(
        `Host: <@${game.hostId}>\n\n` +
        `Mínimo ${MIN_PLAYERS} jugadores.\n\n` +
        `👥 **Jugadores (0)**:\nNadie aún.`
      )
      .setColor(0x00AE86);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("join_leave_game")
        .setLabel("Unirse / Salirse")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("start_game")
        .setLabel("Iniciar")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("close_lobby")
        .setLabel("Cerrar")
        .setStyle(ButtonStyle.Danger)
    );

    const lobbyMessage = await message.channel.send({
      embeds: [embed],
      components: [row]
    });

    const lobbyCollector = lobbyMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 10 * 60_000
    });

    lobbyCollector.on("collect", async interaction => {

      // 🔥 JOIN / LEAVE
      if (interaction.customId === "join_leave_game") {

        if (game.started)
          return interaction.reply({
            content: "El juego ya inició.",
            flags: MessageFlags.Ephemeral
          });

        if (game.players.has(interaction.user.id)) {
          game.players.delete(interaction.user.id);

          await interaction.reply({
            content: "Saliste del juego.",
            flags: MessageFlags.Ephemeral
          });

        } else {

          game.players.set(interaction.user.id, {
            user: interaction.user,
            rule: null,
            alive: true
          });

          await interaction.reply({
            content: "Te uniste al juego.",
            flags: MessageFlags.Ephemeral
          });
        }

        const playerList = [...game.players.values()]
          .map(p => `• ${p.user.username}`)
          .join("\n");

        const updatedEmbed = new EmbedBuilder()
          .setTitle("🎮 Juego de Reglas Secretas")
          .setDescription(
            `Host: <@${game.hostId}>\n\n` +
            `Mínimo ${MIN_PLAYERS} jugadores.\n\n` +
            `👥 **Jugadores (${game.players.size})**:\n` +
            (playerList || "Nadie aún.")
          )
          .setColor(0x00AE86);

        await lobbyMessage.edit({ embeds: [updatedEmbed] });
      }

      // 🔥 START
      if (interaction.customId === "start_game") {

        if (interaction.user.id !== game.hostId)
          return interaction.reply({
            content: "Solo el host puede iniciar.",
            flags: MessageFlags.Ephemeral
          });

        if (game.players.size < MIN_PLAYERS)
          return interaction.reply({
            content: `Se necesitan al menos ${MIN_PLAYERS} jugadores.`,
            flags: MessageFlags.Ephemeral
          });

        game.started = true;

        await interaction.update({ components: [] });
        lobbyCollector.stop();
        await startGame(game);
      }

      // 🔥 CLOSE LOBBY
      if (interaction.customId === "close_lobby") {

        if (interaction.user.id !== game.hostId)
          return interaction.reply({
            content: "Solo el host puede cerrar la partida.",
            flags: MessageFlags.Ephemeral
          });

        await interaction.update({
          content: "❌ La partida fue cerrada por el host.",
          embeds: [],
          components: []
        });

        games.delete(message.guild.id);
        lobbyCollector.stop();
      }

    });

    lobbyCollector.on("end", () => {
      if (!game.started) {
        games.delete(message.guild.id);
      }
    });
  }
};

/* ========================= */
/*        GAME LOGIC         */
/* ========================= */

async function startGame(game) {

  const shuffledRules = [...rulesData].sort(() => Math.random() - 0.5);

  let i = 0;

  for (const player of game.players.values()) {
    player.rule = shuffledRules[i];
    i++;

    try {
      await player.user.send(
        `🎭 Tu regla secreta es:\n\n**${player.rule.rule}**\n\nDificultad: ${player.rule.difficulty}`
      );
    } catch {
      await game.channel.send(
        `⚠️ ${player.user.username}, no pude enviarte DM.`
      );
    }
  }

  game.turnOrder = [...game.players.keys()];
  game.turnIndex = 0;

  await startTurn(game);
}

async function startTurn(game) {

  if (checkGameEnd(game)) return;

  const currentId = game.turnOrder[game.turnIndex];
  const currentPlayer = game.players.get(currentId);

  if (!currentPlayer.alive)
    return nextTurn(game);

  const embed = new EmbedBuilder()
    .setTitle("🕒 Nuevo Turno")
    .setDescription(`Es el turno de <@${currentId}>`)
    .setColor(0xF1C40F);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("end_turn")
      .setLabel("Terminar turno")
      .setStyle(ButtonStyle.Danger)
  );

  const turnMessage = await game.channel.send({
    embeds: [embed],
    components: [row]
  });

  const turnCollector = turnMessage.createMessageComponentCollector({
    componentType: ComponentType.Button
  });

  turnCollector.on("collect", async interaction => {

    if (interaction.user.id !== currentId)
      return interaction.reply({
        content: "No es tu turno.",
        flags: MessageFlags.Ephemeral
      });

    turnCollector.stop();
    await interaction.update({ components: [] });
    await accusationPhase(game, currentId);
  });
}

async function accusationPhase(game, accuserId) {

  const aliveTargets = [...game.players.values()]
    .filter(p => p.alive && p.user.id !== accuserId);

  if (!aliveTargets.length) return nextTurn(game);

  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId("select_target")
    .setPlaceholder("Selecciona jugador")
    .addOptions(
      aliveTargets.map(p => ({
        label: p.user.username,
        value: p.user.id
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(targetSelect);

  const targetMsg = await game.channel.send({
    content: "¿A quién quieres acusar?",
    components: [row1]
  });

  const targetCollector = targetMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    max: 1
  });

  targetCollector.on("collect", async targetInteraction => {

    const targetId = targetInteraction.values[0];
    const targetPlayer = game.players.get(targetId);

    await targetInteraction.update({ components: [] });

    // 🔥 Reglas activas mezcladas dentro de 25
    const activeRuleIds = new Set(
      [...game.players.values()]
        .filter(p => p.alive && p.rule)
        .map(p => p.rule.id)
    );

    const activeRules = rulesData.filter(r => activeRuleIds.has(r.id));
    const remainingRules = rulesData.filter(r => !activeRuleIds.has(r.id));

    const pool = [
      ...activeRules,
      ...remainingRules.slice(0, 25 - activeRules.length)
    ];

    const finalRules = pool.sort(() => Math.random() - 0.5);

    const ruleSelect = new StringSelectMenuBuilder()
      .setCustomId("select_rule")
      .setPlaceholder("Selecciona la regla")
      .addOptions(
        finalRules.map(r => ({
          label: r.rule.slice(0, 90),
          description: `Dificultad: ${r.difficulty}`,
          value: String(r.id)
        }))
      );

    const row2 = new ActionRowBuilder().addComponents(ruleSelect);

    const guessMsg = await game.channel.send({
      content: `¿Cuál es la regla de ${targetPlayer.user.username}?`,
      components: [row2]
    });

    const guessCollector = guessMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      max: 1
    });

    guessCollector.on("collect", async guessInteraction => {

      const selectedRuleId = Number(guessInteraction.values[0]);

      if (targetPlayer.rule.id === selectedRuleId) {
        targetPlayer.alive = false;

        await game.channel.send(
          `💀 ¡Correcto! ${targetPlayer.user.username} queda eliminado.\n` +
          `Su regla era:\n**${targetPlayer.rule.rule}**`
        );
      } else {
        await game.channel.send("❌ Incorrecto.");
      }

      await guessInteraction.update({ components: [] });

      nextTurn(game);
    });
  });
}

function nextTurn(game) {

  do {
    game.turnIndex =
      (game.turnIndex + 1) % game.turnOrder.length;
  } while (!game.players.get(game.turnOrder[game.turnIndex]).alive);

  startTurn(game);
}

function checkGameEnd(game) {

  const alivePlayers = [...game.players.values()].filter(p => p.alive);

  if (alivePlayers.length === 1) {

    game.channel.send(
      `🏆 ${alivePlayers[0].user.username} gana el juego.\n` +
      `Su regla era:\n**${alivePlayers[0].rule.rule}**`
    );

    games.delete(game.channel.guild.id);
    return true;
  }

  return false;
}