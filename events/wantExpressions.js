import { Events, PermissionFlagsBits } from "discord.js";
import expressionImporter from "../lib/expressionImporter.js";

function isRequest(message) {
  return /^lo quiero!$/i.test(message.content.trim());
}

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (message.author.bot || !message.guild || !isRequest(message) || !message.reference?.messageId) return;

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      await message.react("❌").catch(() => null);
      return;
    }

    let sourceMessage;
    try {
      sourceMessage = await message.fetchReference();
    } catch {
      await message.react("❌").catch(() => null);
      return;
    }

    try {
      const result = await expressionImporter.importExpressions({
        guild: message.guild,
        sourceMessage,
        reason: `Requested by ${message.author.tag} from reply ${message.id}`
      });

      await message.react(result.created.length > 0 ? "✅" : "❌");
      if (result.failures.length > 0) {
        console.error("[wantExpressions] Import failures:", result.failures);
      }
    } catch (err) {
      console.error("[wantExpressions] Import error:", err.message);
      await message.react("❌").catch(() => null);
    }
  }
};
