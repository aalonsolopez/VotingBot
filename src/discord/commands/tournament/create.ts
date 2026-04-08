import type { ChatInputCommandInteraction } from "discord.js";
import { createTournament } from "../../../services/tournament.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";
import { parseDateInput } from "../../utils/dateInput.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function tournamentCreate(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para crear torneos.");
  }

  const name = i.options.getString("name", true);
  const startDateRaw = i.options.getString("start_date", false);
  const endDateRaw = i.options.getString("end_date", false);

  const startDate = startDateRaw ? parseDateInput(startDateRaw) : null;
  const endDate = endDateRaw ? parseDateInput(endDateRaw) : null;

  if (startDateRaw && !startDate) {
    return respond(i, "❌ `start_date` inválido. Formatos soportados:\n- ISO 8601: 2026-01-12T20:00:00+01:00\n- DD-MM-YYYY HH:MM: 12-01-2026 20:00");
  }

  if (endDateRaw && !endDate) {
    return respond(i, "❌ `end_date` inválido. Formatos soportados:\n- ISO 8601: 2026-01-12T20:00:00+01:00\n- DD-MM-YYYY HH:MM: 12-01-2026 20:00");
  }

  if (startDate && endDate && startDate.getTime() >= endDate.getTime()) {
    return respond(i, "❌ La fecha de fin debe ser posterior a la fecha de inicio.");
  }

  try {
    const tournament = await createTournament({
      name,
      guildId: i.guildId!,
      creatorId: i.user.id,
      startDate,
      endDate,
    });

    const startDateStr = tournament.startDate
      ? `<t:${Math.floor(new Date(tournament.startDate).getTime() / 1000)}:F>`
      : "No definida";

    const endDateStr = tournament.endDate
      ? `<t:${Math.floor(new Date(tournament.endDate).getTime() / 1000)}:F>`
      : "No definida";

    const content = [
      "✅ **Torneo creado**",
      "",
      `🆔 Tournament ID: \`${tournament.id}\``,
      `📛 Nombre: ${tournament.name}`,
      `📅 Inicio: ${startDateStr}`,
      `📅 Fin: ${endDateStr}`,
      `👤 Creador: <@${tournament.creatorId}>`,
      `📊 Estado: ${tournament.status}`,
    ].join("\n");

    return respond(i, content);
  } catch (e) {
    log.error("tournament/create: fallo creando torneo", e);
    return respond(i, "❌ No se pudo crear el torneo en la base de datos.");
  }
}
