import type { ChatInputCommandInteraction } from "discord.js";
import { env } from "#config/env.js";
import { prisma } from "../../../db/prisma.js";
import { createPrediction, getPredictionById } from "../../../services/prediction.js";
import { getById as getTournamentById } from "../../../services/tournament.js";
import { buildPredictionMessage } from "../../views/predictionEmbed.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";
import { createTournamentSelect } from "../../components/tournamentSelect.js";
import { saveCommandData } from "../../tempData.js";

async function respond(i: ChatInputCommandInteraction, content: string | { content?: string; components?: any[] }) {
  // 64 = MessageFlags.Ephemeral
  const options = typeof content === 'string' 
    ? { content, flags: 64 }
    : { ...content, flags: 64 };
    
  if (i.deferred) return i.editReply(options);
  if (i.replied) return i.followUp(options);
  return i.reply(options);
}

function parseLockAt(raw: string): Date | null {
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

export async function predCreate(i: ChatInputCommandInteraction) {
  // Nota: en main.ts ya haces deferReply(ephemeral) para comandos.
  // Aquí, SIEMPRE responde con respond() para evitar 40060 (already acknowledged).

  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para crear predicciones.");
  }

  const title = i.options.getString("title", true);
  const game = i.options.getString("game", false);
  const tournamentId = i.options.getString("tournament", false);

  const optionsCsv = i.options.getString("options", true); // "G2,FNC"
  const options = optionsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const lockAtRaw = i.options.getString("lock_at", true);

  const lockTime = parseLockAt(lockAtRaw);
  if (!lockTime) {
    return respond(
      i,
      "❌ `lock_at` inválido. Formatos soportados:\n" +
        "- ISO 8601 (recomendado): 2026-01-12T20:00:00+01:00\n" +
        "- DD-MM-YYYY HH:MM (hora local del servidor): 12-01-2026 20:00"
    );
  }

  if (lockTime.getTime() <= Date.now()) {
    return respond(i, "❌ La fecha de cierre debe ser futura.");
  }

  // Discord limita componentes: máximo 25 botones por mensaje. Te dejo un límite razonable:
  if (options.length < 2) return respond(i, "Pon al menos 2 opciones (separadas por coma).");
  if (options.length > 25) return respond(i, "Demasiadas opciones. Máximo 25 opciones.");

  // Evita duplicados exactos (por UX + posibles constraints tuyas)
  const normalized = new Set<string>();
  for (const opt of options) {
    const k = opt.toLowerCase();
    if (normalized.has(k)) return respond(i, "Tienes opciones duplicadas. Revisa `options`.");
    normalized.add(k);
  }

  // Si no se especificó torneo, mostrar dropdown
  if (!tournamentId) {
    // Guardar parámetros para usarlos cuando se seleccione torneo
    saveCommandData(
      i.guildId!,
      i.user.id,
      "pred-create",
      {
        title,
        game,
        optionsCsv,
        lockAtRaw,
        channelId: i.channelId!,
      },
      10 // 10 minutos TTL
    );

    // Mostrar dropdown de selección de torneo
    try {
      const { row } = await createTournamentSelect(i.guildId!, null, "pred-create");
      return respond(i, {
        content: "Selecciona un torneo para la predicción (o selecciona 'Sin torneo' para predicción general):",
        components: [row],
      });
    } catch (error) {
      log.error("pred/create: error mostrando dropdown", error);
      return respond(i, "❌ Error al mostrar selección de torneo.");
    }
  }

  // 1) Crea en DB (sin messageId aún)
  let pred: any;
  try {
    pred = await createPrediction({
      guildId: i.guildId!,
      channelId: i.channelId!,
      title,
      game,
      lockTime,
      createdBy: i.user.id,
      tournamentId,
      options,
    });
  } catch (e) {
    log.error("pred/create: fallo creando en DB", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    if (msg.includes("Tournament is not active")) {
      return respond(i, "❌ El torneo no está activo o no existe.");
    }
    return respond(i, "❌ No se pudo crear la predicción en la base de datos.");
  }

  // 2) Construye y publica el mensaje en el canal
  const payload = buildPredictionMessage({
    predictionId: pred.id,
    title: pred.title,
    game: pred.game,
    options: pred.options.map((o: any) => ({ id: o.id, label: o.label })),
  });

  let msgId: string | null = null;
  try {
    const ch = i.channel ?? (await i.client.channels.fetch(i.channelId).catch(() => null));
    if (!ch || !ch.isTextBased() || !("send" in ch)) {
      // Si no podemos mandar, limpia DB para no dejar basura
      await prisma.prediction.delete({ where: { id: pred.id } }).catch(() => {});
      return respond(i, "❌ No pude publicar el mensaje en este canal (canal no válido).");
    }

    const msg = await ch.send(payload);
    msgId = msg.id;
  } catch (e) {
    log.error("pred/create: fallo enviando mensaje al canal", e);
    // Limpia DB para evitar predicción huérfana
    await prisma.prediction.delete({ where: { id: pred.id } }).catch(() => {});
    return respond(
      i,
      "❌ No pude publicar el mensaje en este canal. ¿Tengo permisos de **Enviar mensajes** y **Insertar enlaces/embeds**?"
    );
  }

  // 3) Actualiza messageId
  try {
    await prisma.prediction.update({
      where: { id: pred.id },
      data: { messageId: msgId },
    });
  } catch (e) {
    log.error("pred/create: fallo guardando messageId (la predicción ya existe)", e);
    // No abortamos: el mensaje ya está publicado, pero avisamos al admin.
  }

  // 4) Respuesta al usuario (best-effort)
  const jumpLink =
    i.guildId && msgId ? `https://discord.com/channels/${i.guildId}/${i.channelId}/${msgId}` : null;

  const lockInfo = pred.lockTime
    ? `<t:${Math.floor(new Date(pred.lockTime).getTime() / 1000)}:F>`
    : "(sin cierre automático)";

  // Obtener información del torneo si se especificó
  let tournamentInfo = "";
  if (pred.tournamentId) {
    try {
      const tournament = await getTournamentById(pred.tournamentId, i.guildId!);
      if (tournament) {
        tournamentInfo = `\n🏆 Torneo: ${tournament.name}`;
      }
    } catch (e) {
      // Ignorar error, continuar sin info de torneo
    }
  }

  const idsLines = [
    `✅ Predicción creada.`,
    tournamentInfo,
    "",
    `🆔 Prediction ID: \`${pred.id}\``,
    `Cierre: ${lockInfo}`,
    jumpLink ? `Mensaje: ${jumpLink}` : null,
    "",
    "Opciones:",
    ...pred.options.map((o: any) => `- ${o.label}: \`${o.id}\``),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await respond(i, idsLines);
  } catch (e: any) {
    if (e?.code === 10062) {
      log.warn("pred/create: respuesta falló con 10062", { ageMs: Date.now() - i.createdTimestamp });
      // Aunque no podamos responder, la predicción ya quedó publicada.
    } else {
      log.error("pred/create: fallo respondiendo a la interacción", e);
    }
  }

  // 5) Publica los IDs en un canal dedicado (best-effort)
  const idsChannelId = env.PRED_IDS_CHANNEL_ID ?? "1460324481661927617";
  const logText = [
    "🆔 **IDs de predicción**",
    `Prediction ID: \`${pred.id}\``,
    `Cierre: ${lockInfo}`,
    jumpLink ? `Mensaje: ${jumpLink}` : null,
    "",
    "Opciones:",
    ...pred.options.map((o: any) => `- ${o.label}: \`${o.id}\``),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ch = await i.client.channels.fetch(idsChannelId);
    if (ch && ch.isTextBased() && "send" in ch) {
      await ch.send({ content: logText });
    }
  } catch {
    // ignore
  }
}
