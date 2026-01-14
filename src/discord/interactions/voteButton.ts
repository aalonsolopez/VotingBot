import type { ButtonInteraction } from "discord.js";
import { prisma } from "#db/prisma.js";
import { decodeVoteId } from "../ids/customId.js";
import { disableMessageButtons, sendAutoCloseMessage } from "../pred/autoClose.js";

export async function voteButton(i: ButtonInteraction): Promise<boolean> {
  const parsed = decodeVoteId(i.customId);
  if (!parsed) return false;

  if (!i.inGuild()) {
    await i.reply({ content: "Solo en servidores.", ephemeral: true });
    return true;
  }

  // Diferir la respuesta INMEDIATAMENTE para evitar timeout de 3s
  try {
    await i.deferReply({ ephemeral: true });
  } catch (err) {
    // Si falla el defer, probablemente ya expiró. Log pero continúa.
    console.error("deferReply falló:", err);
    return false;
  }

  const pred = await prisma.prediction.findUnique({
    where: { id: parsed.predictionId },
    select: { id: true, status: true, lockTime: true, channelId: true, messageId: true, title: true },
  });

  if (!pred || pred.status !== "OPEN") {
    await i.editReply({ content: "Esta predicción ya no está abierta." });
    return true;
  }

  if (pred.lockTime && pred.lockTime.getTime() <= Date.now()) {
    const res = await prisma.prediction.updateMany({
      where: { id: pred.id, status: "OPEN" },
      data: { status: "CLOSED" },
    });

    if (res.count === 1 && pred.messageId) {
      await disableMessageButtons(i.client, pred.channelId, pred.messageId);
    }

    if (res.count === 1) {
      await sendAutoCloseMessage(i.client, {
        guildId: i.guildId!,
        channelId: pred.channelId,
        messageId: pred.messageId,
        title: pred.title,
        lockTime: pred.lockTime,
      });
    }

    await i.editReply({ content: "⏰ Votaciones cerradas para esta predicción." });
    return true;
  }

  await prisma.vote.upsert({
    where: { predictionId_userId: { predictionId: parsed.predictionId, userId: i.user.id } },
    create: {
      predictionId: parsed.predictionId,
      userId: i.user.id,
      optionId: parsed.optionId,
    },
    update: { optionId: parsed.optionId },
  });

  await i.editReply({ content: "✅ Voto registrado." });
  return true;
}
