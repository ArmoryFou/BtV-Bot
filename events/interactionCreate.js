export default {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error("Autocomplete error:", err);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      if (customId.startsWith("ranking_period:") || customId.startsWith("ranking_page:")) {
        const command = client.commands.get("ranking");
        if (command?.handleSelect) {
          try {
            await command.handleSelect(interaction);
          } catch (err) {
            console.error("Select menu error:", err);
          }
        }
      }
      return;
    }

    // En tu evento interactionCreate, después de manejar slash commands:
if (interaction.isButton() && interaction.customId === "voting_refresh") {
  const votingCmd = interaction.client.commands.get("voting");
  if (votingCmd?.handleRefresh) {
    await votingCmd.handleRefresh(interaction);
  }
}

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error("Slash command error:", err);
        if (!interaction.replied) {
          await interaction.reply({
            content: "Error executing command.",
            flags: 64
          });
        }
      }
    }
  }
};