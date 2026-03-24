import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getByGuild } from "../../services/tournament.js";
import type { Tournament } from "../../types/tournament.js";

export interface TournamentSelectOption {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
}

export async function createTournamentSelect(
  guildId: string,
  selectedTournamentId?: string | null
): Promise<{ row: ActionRowBuilder<StringSelectMenuBuilder>; tournaments: Tournament[] }> {
  const tournaments = await getByGuild(guildId, { status: "ACTIVE" });
  
  const options: TournamentSelectOption[] = tournaments.map((tournament) => ({
    label: tournament.name,
    value: tournament.id,
    description: `ID: ${tournament.id}`,
    default: tournament.id === selectedTournamentId,
  }));

  // Si no hay torneos activos, crear opción por defecto
  if (options.length === 0) {
    options.push({
      label: "Sin torneos activos",
      value: "none",
      description: "No hay torneos activos en este servidor",
      default: true,
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("tournament-select")
    .setPlaceholder("Selecciona un torneo")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  return { row, tournaments };
}

export function parseTournamentSelectInteraction(
  customId: string,
  values: string[]
): { tournamentId: string | null } | null {
  if (customId !== "tournament-select") return null;
  
  const selected = values[0];
  if (!selected || selected === "none") return { tournamentId: null };
  
  return { tournamentId: selected };
}