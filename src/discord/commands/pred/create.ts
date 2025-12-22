import type { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../../db/prisma.js";
import { buildPredictionMessage } from "../../views/predictionEmbed.js";

export async function predCreate(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", ephemeral: true });

  const title = i.options.getString("title", true);
  const game = i.options.getString("game", false);
  const optionsCsv = i.options.getString("options", true); // "G2,FNC"
  const options = optionsCsv.split(",").map(s => s.trim()).filter(Boolean);

  if (options.length < 2) {
    return i.reply({ content: "Pon al menos 2 opciones (separadas por coma).", ephemeral: true });
  }

  const pred = await prisma.prediction.create({
    data: {
      guildId: i.guildId!,
      channelId: i.channelId!,
      title,
      game,
      createdBy: i.user.id,
      options: { create: options.map(label => ({ label })) },
    },
    include: { options: true },
  });

  const payload = buildPredictionMessage({
    predictionId: pred.id,
    title: pred.title,
    game: pred.game,
    options: pred.options.map(o => ({ id: o.id, label: o.label })),
  });

  await i.reply({ content: "✅ Predicción creada:", ephemeral: true });
  const msg = await i.channel!.send(payload);

  await prisma.prediction.update({
    where: { id: pred.id },
    data: { messageId: msg.id },
  });
}
