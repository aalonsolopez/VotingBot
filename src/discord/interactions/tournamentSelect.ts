import type { StringSelectMenuInteraction } from "discord.js";
import { parseTournamentSelectInteraction } from "../components/tournamentSelect.js";
import { getCommandData, deleteCommandData } from "../tempData.js";
import { createPrediction } from "../../services/prediction.js";
import { buildPredictionMessage } from "../views/predictionEmbed.js";
import { getById as getTournamentById } from "../../services/tournament.js";
import { getPointsLeaderboard, getParticipationLeaderboard } from "../../services/leaderboard.js";
import { prisma } from "#db/prisma.js";
import { log } from "#src/log.js";
import { env } from "#config/env.js";
import { parseDateInput } from "../utils/dateInput.js";

export async function handleTournamentSelect(i: StringSelectMenuInteraction): Promise<boolean> {
  const parsed = parseTournamentSelectInteraction(i.customId, i.values);
  if (!parsed) return false;
  
  const { tournamentId, command } = parsed;
  const userId = i.user.id;
  const guildId = i.guildId!;
  
  // Manejar diferentes comandos
  switch (command) {
    case "pred-create":
      return await handlePredCreateSelection(i, guildId, userId, tournamentId);
    case "pred-leaderboard":
      return await handlePredLeaderboardSelection(i, guildId, userId, tournamentId);
    default:
      // Comando no reconocido
      if (tournamentId === null) {
        await i.editReply({
          content: "✅ Seleccionaste: Predicciones sin torneo (General)",
          components: [],
        });
      } else {
        await i.editReply({
          content: `✅ Torneo seleccionado: **${tournamentId}**\nUsa este ID en comandos de predicción.`,
          components: [],
        });
      }
      return true;
  }
}

async function handlePredCreateSelection(
  i: StringSelectMenuInteraction,
  guildId: string,
  userId: string,
  tournamentId: string | null
): Promise<boolean> {
  // Recuperar datos guardados del comando
  const commandData = getCommandData(guildId, userId, "pred-create");
  if (!commandData) {
    await i.editReply({
      content: "❌ No se encontraron datos de la predicción. Por favor, ejecuta el comando `/pred create` de nuevo.",
      components: [],
    });
    return true;
  }
  
  const { params } = commandData;
  
  // Validar que los datos siguen siendo válidos (lockTime no expiró)
  const lockTime = parseDateInput(params.lockAtRaw);
  if (!lockTime || lockTime.getTime() <= Date.now()) {
    await i.editReply({
      content: "❌ La fecha de cierre ya no es válida. Por favor, ejecuta el comando `/pred create` de nuevo.",
      components: [],
    });
    deleteCommandData(guildId, userId, "pred-create");
    return true;
  }
  
  // Validar tournamentId si se seleccionó uno
  if (tournamentId) {
    try {
      const tournament = await getTournamentById(tournamentId, guildId);
      if (!tournament) {
        await i.editReply({
          content: "❌ El torneo seleccionado no existe en este servidor.",
          components: [],
        });
        deleteCommandData(guildId, userId, "pred-create");
        return true;
      }
      if (tournament.status !== "ACTIVE") {
        await i.editReply({
          content: "❌ El torneo seleccionado no está activo.",
          components: [],
        });
        deleteCommandData(guildId, userId, "pred-create");
        return true;
      }
    } catch (error) {
      log.error("tournamentSelect: error verificando torneo", error);
      await i.editReply({
        content: "❌ Error al verificar el torneo seleccionado.",
        components: [],
      });
      deleteCommandData(guildId, userId, "pred-create");
      return true;
    }
  }
  
  // Parsear opciones
  const options = params.optionsCsv
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  
  try {
    // Crear predicción
    const pred = await createPrediction({
      guildId,
      channelId: params.channelId,
      title: params.title,
      game: params.game,
      lockTime,
      createdBy: userId,
      tournamentId,
      options,
    });
    
    // Construir y publicar mensaje
    const payload = buildPredictionMessage({
      predictionId: pred.id,
      title: pred.title,
      game: pred.game,
      options: pred.options.map((o: any) => ({ id: o.id, label: o.label })),
    });
    
    // Enviar al canal original
    const channel = await i.client.channels.fetch(params.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      await i.editReply({
        content: "❌ No se pudo enviar la predicción al canal.",
        components: [],
      });
      deleteCommandData(guildId, userId, "pred-create");
      return true;
    }
    
    const msg = await channel.send(payload);
    
    // Actualizar messageId
    await prisma.prediction.update({
      where: { id: pred.id },
      data: { messageId: msg.id },
    });
    
    // Obtener información del torneo
    let tournamentInfo = "";
    if (tournamentId) {
      try {
        const tournament = await getTournamentById(tournamentId, guildId);
        if (tournament) {
          tournamentInfo = `\n🏆 Torneo: ${tournament.name}`;
        }
      } catch (e) {
        // Ignorar error
      }
    }
    
    // Responder al usuario
    const jumpLink = `https://discord.com/channels/${guildId}/${params.channelId}/${msg.id}`;
    const lockInfo = `<t:${Math.floor(lockTime.getTime() / 1000)}:F>`;
    
    const content = [
      "✅ **Predicción creada exitosamente**",
      tournamentInfo,
      `🆔 Prediction ID: \`${pred.id}\``,
      `⏰ Cierre: ${lockInfo}`,
      `🔗 Mensaje: ${jumpLink}`,
      "Opciones:",
      ...pred.options.map((o: any) => `- ${o.label}: \`${o.id}\``),
    ].join("\n");
    
    await i.editReply({
      content,
      components: [],
    });
    
    // Limpiar datos temporales
    deleteCommandData(guildId, userId, "pred-create");
    
    // Publicar IDs en canal dedicado (best-effort)
    const idsChannelId = env.PRED_IDS_CHANNEL_ID ?? "1460324481661927617";
    const logText = [
      "🆔 **IDs de predicción**",
      `Prediction ID: \`${pred.id}\``,
      `Cierre: ${lockInfo}`,
      `Mensaje: ${jumpLink}`,
      "",
      "Opciones:",
      ...pred.options.map((o: any) => `- ${o.label}: \`${o.id}\``),
    ].join("\n");
    
    try {
      const idsChannel = await i.client.channels.fetch(idsChannelId);
      if (idsChannel && idsChannel.isTextBased() && "send" in idsChannel) {
        await idsChannel.send({ content: logText });
      }
    } catch {
      // ignore
    }
    
    return true;
    
  } catch (error) {
    log.error("tournamentSelect: error creando predicción", error);
    await i.editReply({
      content: "❌ Error al crear la predicción. Por favor, intenta de nuevo.",
      components: [],
    });
    deleteCommandData(guildId, userId, "pred-create");
    return true;
  }
}

async function handlePredLeaderboardSelection(
  i: StringSelectMenuInteraction,
  guildId: string,
  userId: string,
  tournamentId: string | null
): Promise<boolean> {
  // Recuperar datos guardados del comando
  const commandData = getCommandData(guildId, userId, "pred-leaderboard");
  if (!commandData) {
    await i.editReply({
      content: "❌ No se encontraron datos del leaderboard. Por favor, ejecuta el comando `/pred leaderboard` de nuevo.",
      components: [],
    });
    return true;
  }
  
  const { params } = commandData;
  const limit = params.limit;
  const mode = params.mode;
  
  // Determinar nombre del torneo
  let tournamentName = "";
  if (tournamentId) {
    try {
      const tournament = await getTournamentById(tournamentId, guildId);
      if (!tournament) {
        await i.editReply({
          content: "❌ El torneo seleccionado no existe en este servidor.",
          components: [],
        });
        deleteCommandData(guildId, userId, "pred-leaderboard");
        return true;
      }
      tournamentName = ` - ${tournament.name}`;
    } catch (error) {
      log.error("tournamentSelect: error verificando torneo", error);
      await i.editReply({
        content: "❌ Error al verificar el torneo seleccionado.",
        components: [],
      });
      deleteCommandData(guildId, userId, "pred-leaderboard");
      return true;
    }
  }
  
  try {
    let content = "";
    
    if (mode === "votes" || mode === "participation") {
      // Leaderboard por participación
      const options: { guildId: string; tournamentId?: string; limit: number } = {
        guildId,
        limit,
      };
      if (tournamentId) options.tournamentId = tournamentId;
      const rows = await getParticipationLeaderboard(options);
      
      if (!rows.length) {
        content = "Aún no hay votos registrados para generar el leaderboard.";
      } else {
        const lines = rows.map((r, idx) => {
          const n = r.total;
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
          return `${medal} **${idx + 1}.** <@${r.userId}> — **${n}** voto${n === 1 ? "" : "s"}`;
        });
        
        content = [`🏁 **Leaderboard de participación${tournamentName} (Top ${rows.length})**`, "", ...lines].join("\n");
      }
    } else {
      // Leaderboard por puntos
      const options2: { guildId: string; tournamentId?: string; limit: number } = {
        guildId,
        limit,
      };
      if (tournamentId) options2.tournamentId = tournamentId;
      const top = await getPointsLeaderboard(options2);
      
      if (!top.length) {
        content = "Aún no hay puntos registrados para generar el leaderboard.";
      } else {
        const lines = top.map((r, idx) => {
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
          return `${medal} **${idx + 1}.** <@${r.userId}> — **${r.total}** punto${r.total === 1 ? "" : "s"}`;
        });
        
        content = [`🏆 **Leaderboard de puntos${tournamentName} (Top ${top.length})**`, "", ...lines].join("\n");
      }
    }
    
    await i.editReply({
      content,
      components: [],
    });
    
    // Limpiar datos temporales
    deleteCommandData(guildId, userId, "pred-leaderboard");
    return true;
    
  } catch (error) {
    log.error("tournamentSelect: error generando leaderboard", error);
    await i.editReply({
      content: "❌ Error al generar el leaderboard. Por favor, intenta de nuevo.",
      components: [],
    });
    deleteCommandData(guildId, userId, "pred-leaderboard");
    return true;
  }
}
