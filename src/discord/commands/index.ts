import type { ChatInputCommandInteraction } from "discord.js";
import { predCreate } from "./pred/create.js";
import { predStats } from "./pred/stats.js";
import { predResolve } from "./pred/resolve.js";
import { predUndo } from "./pred/undo.js";
import { leaderboard } from "./pred/leaderboard.js";
import { predSeeVotes } from "./pred/my_votes.js";
import { isAdminOrMod } from "./permissions.js";


async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}


export async function handleCommand(i: ChatInputCommandInteraction) {
  if (i.commandName !== "pred") return;

  if (!i.inGuild()) {
    return respond(i, "Solo en servidores.");
  }
  
  const sub = i.options.getSubcommand();

  // Disponible para cualquier usuario (incluidos admins/mods)
  if (sub === "my_votes") return predSeeVotes(i);

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ Solo admins o moderadores pueden usar estos comandos.");
  }

  if (sub === "create") return predCreate(i);
  if (sub === "stats") return predStats(i);
  if (sub === "resolve") return predResolve(i);
  if (sub === "undo") return predUndo(i);
  if (sub === "leaderboard") return leaderboard(i);

  return respond(i, "Subcomando no soportado.");
}
