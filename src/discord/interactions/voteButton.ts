import type { ButtonInteraction } from "discord.js";
import { prisma } from "#db/prisma.js";
import { decodeVoteId } from "../ids/customId.js";
import { disableMessageButtons, sendAutoCloseMessage } from "../pred/autoClose.js";
import { log } from "#log.js";

/**
 * Button handler: registra (o actualiza) el voto de un usuario.
 *
 * Importante con el main.ts nuevo:
 * - Para botones haces `deferUpdate()` (NO deferReply).
 * - Por tanto aquí NO uses `editReply()` como respuesta principal.
 *   Para dar feedback al usuario: `followUp({ ephemeral: true })`.
 *   Para actualizar el mensaje original: `i.message.edit(...)` o `disableMessageButtons(...)`.
 */
export async function voteButton(i: ButtonInteraction): Promise<boolean> {
  const parsed = decodeVoteId(i.customId);
  if (!parsed) return false;

  if (!i.inGuild()) {
    // En botones, si main.ts hizo deferUpdate, el reply no existe: usamos followUp ephemeral.
    try {
      await i.followUp({ content: "Solo en servidores.", flags: 64 });
    } catch {}
    return true;
  }

  // Nota: main.ts ya hizo deferUpdate() para botones.
  // Aquí NO llamamos a defer/reply/update de nuevo.

  const pred = await prisma.prediction.findUnique({
    where: { id: parsed.predictionId },
    select: {
      id: true,
      status: true,
      lockTime: true,
      guildId: true,
      channelId: true,
      messageId: true,
      title: true,
    },
  });

  if (!pred || pred.status !== "OPEN") {
    try {
      await i.followUp({ content: "Esta predicción ya no está abierta.", flags: 64 });
    } catch {}
    return true;
  }

  // Si ya pasó lockTime, cerramos (race-safe con updateMany)
  if (pred.lockTime && pred.lockTime.getTime() <= Date.now()) {
    const res = await prisma.prediction.updateMany({
      where: { id: pred.id, status: "OPEN" },
      data: { status: "CLOSED" },
    });

    // Si este handler fue el que realmente cerró, deshabilita botones y anuncia autocierre
    if (res.count === 1) {
      if (pred.messageId) {
        try {
          await disableMessageButtons(i.client, pred.channelId, pred.messageId);
        } catch (e) {
          log.warn("voteButton: no se pudo deshabilitar botones", {
            predictionId: pred.id,
            channelId: pred.channelId,
            messageId: pred.messageId,
          });
        }
      }

      try {
        await sendAutoCloseMessage(i.client, {
          guildId: pred.guildId,
          channelId: pred.channelId,
          messageId: pred.messageId,
          title: pred.title,
          lockTime: pred.lockTime,
        });
      } catch {
        // ignore
      }
    }

    try {
      await i.followUp({ content: "⏰ Votaciones cerradas para esta predicción.", flags: 64 });
    } catch {}
    return true;
  }

  // Registra / actualiza voto (1 voto por usuario y predicción)
  try {
    await prisma.vote.upsert({
      where: {
        predictionId_userId: {
          predictionId: parsed.predictionId,
          userId: i.user.id,
        },
      },
      create: {
        predictionId: parsed.predictionId,
        userId: i.user.id,
        optionId: parsed.optionId,
      },
      update: { optionId: parsed.optionId },
    });
  } catch (e) {
    log.error("voteButton: error guardando voto", e);
    try {
      await i.followUp({ content: "❌ No pude registrar tu voto (error DB).", flags: 64 });
    } catch {}
    return true;
  }

  // Feedback al usuario (ephemeral)
  try {
    await i.followUp({ content: "✅ Voto registrado.", flags: 64 });
  } catch (e: any) {
    // 10062 = interaction expired/unknown; 40060 = already acknowledged; en botones puede pasar en dev
    if (e?.code !== 10062 && e?.code !== 40060) {
      log.warn("voteButton: no se pudo enviar confirmación", e);
    }
  }

  return true;
}
