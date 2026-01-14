import type { ChatInputCommandInteraction } from "discord.js";
import { predCreate } from "./pred/create.js";
import { predStats } from "./pred/stats.js";
import { predResolve } from "./pred/resolve.js";
import { leaderboard } from "./pred/leaderboard.js";
import { isAdminOrMod } from "./permissions.js";

export async function handleCommand(i: ChatInputCommandInteraction) {
  if (i.commandName !== "pred") return;

  if (!i.inGuild()) {
    return i.reply({ content: "Solo en servidores.", ephemeral: true });
  }

  if (!isAdminOrMod(i)) {
    return i.reply({ content: "❌ Solo admins o moderadores pueden usar estos comandos.", ephemeral: true });
  }

  const sub = i.options.getSubcommand();
  if (sub === "create") return predCreate(i);
  if (sub === "stats") return predStats(i);
  if (sub === "resolve") return predResolve(i);
  if (sub === "leaderboard") return leaderboard(i);

  return i.reply({ content: "Subcomando no soportado.", ephemeral: true });
}
