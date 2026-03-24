import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { voteButton } from "./voteButton.js";
import { handleTournamentSelect } from "./tournamentSelect.js";

export async function handleInteraction(i: ButtonInteraction | StringSelectMenuInteraction) {
  if (i.isButton()) {
    const ok = await voteButton(i);
    if (!ok) return i.reply({ content: "Interacción no soportada.", ephemeral: true });
    return;
  }
  
  if (i.isStringSelectMenu()) {
    const ok = await handleTournamentSelect(i);
    if (!ok) return i.reply({ content: "Interacción no soportada.", ephemeral: true });
    return;
  }
  
  // Este caso nunca debería ocurrir (i siempre es ButtonInteraction | StringSelectMenuInteraction)
  // Pero TypeScript necesita exhaustividad
  const _exhaustiveCheck: never = i;
  return _exhaustiveCheck;
}
