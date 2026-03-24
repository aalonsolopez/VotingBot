import type { ChatInputCommandInteraction } from "discord.js";
import { createTournament } from "../../../services/tournament.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Formato: DD-MM-YYYY HH:MM (en hora local del servidor)
  // Ej: 12-01-2026 20:00
  const m = /^([0-3]\d)-([0-1]\d)-(\d{4})\s+([0-2]\d):([0-5]\d)$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);

    if (month < 1 || month > 12) return null;
    if (hour > 23) return null;

    const d = new Date(year, month - 1, day, hour, minute, 0, 0);
    // Valida que no haya overflow (p.ej. 31-02-2026)
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day ||
      d.getHours() !== hour ||
      d.getMinutes() !== minute
    ) {
      return null;
    }
    return d;
  }

  // ISO 8601 (con o sin zona)
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function tournamentCreate(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para crear torneos.");
  }

  const name = i.options.getString("name", true);
  const startDateRaw = i.options.getString("start_date", false);
  const endDateRaw = i.options.getString("end_date", false);

  const startDate = startDateRaw ? parseDate(startDateRaw) : null;
  const endDate = endDateRaw ? parseDate(endDateRaw) : null;

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