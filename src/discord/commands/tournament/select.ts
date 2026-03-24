import type { ChatInputCommandInteraction } from "discord.js";
import { createTournamentSelect } from "../../components/tournamentSelect.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function tournamentSelect(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");
  
  const guildId = i.guildId!;
  
  try {
    const { row, tournaments } = await createTournamentSelect(guildId);
    
    if (tournaments.length === 0) {
      return respond(i, "No hay torneos activos en este servidor. Crea uno con `/tournament create`.");
    }
    
    // Enviar mensaje con dropdown
    await i.reply({
      content: "Selecciona un torneo para ver sus predicciones:",
      components: [row],
      ephemeral: true,
    });
    
  } catch (error) {
    console.error("Error creating tournament select:", error);
    return respond(i, "❌ Error al cargar torneos.");
  }
}