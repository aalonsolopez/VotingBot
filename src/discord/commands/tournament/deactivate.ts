import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionsBitField } from "discord.js";
import { deactivateTournament, activateTournament, getById } from "../../../services/tournament.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function tournamentDeactivate(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para gestionar torneos.");
  }

  const tournamentId = i.options.getString("id", true);
  const action = i.options.getString("action", true) as "deactivate" | "activate";

  // Verificar que el torneo existe y pertenece al guild
  const tournament = await getById(tournamentId, i.guildId!);
  if (!tournament) {
    return respond(i, "❌ Torneo no encontrado en este servidor.");
  }

  // Verificar permisos: solo el creador o admins/mods pueden modificar
  const member = i.member;
  // @ts-expect-error - typing de i.member varía
  const perms = member?.permissions ? new PermissionsBitField(member.permissions) : null;
  const isAdmin = perms?.has(PermissionsBitField.Flags.Administrator) ?? false;
  const isMod = perms?.has(PermissionsBitField.Flags.ManageGuild) ?? false;

  if (tournament.creatorId !== i.user.id && !isAdmin && !isMod) {
    return respond(i, "❌ Solo el creador del torneo o administradores pueden modificarlo.");
  }

  try {
    let result;
    if (action === "deactivate") {
      result = await deactivateTournament(tournamentId, i.guildId!);
    } else {
      result = await activateTournament(tournamentId, i.guildId!);
    }

    if (!result) {
      return respond(i, "❌ No se pudo actualizar el torneo.");
    }

    const statusEmoji = result.status === "ACTIVE" ? "🟢" : "🔴";
    const statusText = result.status === "ACTIVE" ? "Activo" : "Inactivo";

    const content = [
      `✅ **Torneo ${action === "deactivate" ? "desactivado" : "activado"}**`,
      "",
      `🆔 Tournament ID: \`${result.id}\``,
      `📛 Nombre: ${result.name}`,
      `${statusEmoji} Estado: ${statusText}`,
    ].join("\n");

    return respond(i, content);
  } catch (e) {
    log.error("tournament/deactivate: fallo actualizando torneo", e);
    return respond(i, "❌ No se pudo actualizar el torneo.");
  }
}