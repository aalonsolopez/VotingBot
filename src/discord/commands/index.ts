import type { ChatInputCommandInteraction } from "discord.js";
import { predCreate } from "./pred/create.js";
import { predStats } from "./pred/stats.js";
import { predResolve } from "./pred/resolve.js";
import { predLeaderboard } from "./pred/leaderboard.js";

export async function handleCommand(i: ChatInputCommandInteraction) {
  if (i.commandName !== "pred") return;

  const sub = i.options.getSubcommand();
  if (sub === "create") return predCreate(i);
  if (sub === "stats") return predStats(i);
  if (sub === "resolve") return predResolve(i);
  if (sub === "leaderboard") return predLeaderboard(i);

  return i.reply({ content: "Subcomando no soportado.", ephemeral: true });
}
