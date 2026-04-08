import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getByGuild } from "../../services/tournament.js";
import type { Tournament } from "../../types/tournament.js";

export interface TournamentSelectOption {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
}

export interface CreateTournamentSelectOptions {
  includeNoneOption?: boolean;
}

export async function createTournamentSelect(
  guildId: string,
  selectedTournamentId?: string | null,
  command: string = "general",
  optionsConfig: CreateTournamentSelectOptions = {}
): Promise<{ row: ActionRowBuilder<StringSelectMenuBuilder>; tournaments: Tournament[] }> {
  const tournaments = await getByGuild(guildId, { status: "ACTIVE" });
  const options: TournamentSelectOption[] = [];

  if (optionsConfig.includeNoneOption) {
    options.push({
      label: "Sin torneo",
      value: "none",
      description: "Usa la clasificación global o una predicción general",
      default: selectedTournamentId === null,
    });
  }

  options.push(...tournaments.map((tournament) => ({
    label: tournament.name,
    value: tournament.id,
    description: `ID: ${tournament.id}`,
    default: tournament.id === selectedTournamentId,
  })));

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
    .setCustomId(`tournament-select-${command}`)
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
): { tournamentId: string | null; command: string } | null {
  const prefix = "tournament-select-";
  if (!customId.startsWith(prefix)) return null;
  
  const command = customId.slice(prefix.length);
  const selected = values[0];
  const tournamentId = (!selected || selected === "none") ? null : selected;
  
  return { tournamentId, command };
}
