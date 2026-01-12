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

  const pred = await prisma.prediction.findUnique({
    where: { id: parsed.predictionId },
    select: { id: true, status: true, lockTime: true, channelId: true, messageId: true, title: true },
  });

  if (!pred || pred.status !== "OPEN") {
    await i.reply({ content: "Esta predicción ya no está abierta.", ephemeral: true });
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

    await i.reply({ content: "⏰ Votaciones cerradas para esta predicción.", ephemeral: true });
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

  await i.reply({ content: "✅ Voto registrado.", ephemeral: true });
  return true;
}
