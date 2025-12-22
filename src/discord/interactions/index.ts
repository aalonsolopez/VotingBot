import type { ButtonInteraction } from "discord.js";
import { voteButton } from "./voteButton.js";

export async function handleInteraction(i: ButtonInteraction) {
  const ok = await voteButton(i);
  if (!ok) return i.reply({ content: "Interacción no soportada.", ephemeral: true });
}
