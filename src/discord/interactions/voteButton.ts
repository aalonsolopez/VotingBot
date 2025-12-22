import type { ButtonInteraction } from "discord.js";
import { prisma } from "#db/prisma.js";
import { decodeVoteId } from "../ids/customId.js";

export async function voteButton(i: ButtonInteraction): Promise<boolean> {
  const parsed = decodeVoteId(i.customId);
  if (!parsed) return false;

  if (!i.inGuild()) {
    await i.reply({ content: "Solo en servidores.", ephemeral: true });
    return true;
  }

  const pred = await prisma.prediction.findUnique({
    where: { id: parsed.predictionId },
    select: { id: true, status: true },
  });

  if (!pred || pred.status !== "OPEN") {
    await i.reply({ content: "Esta predicción ya no está abierta.", ephemeral: true });
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
