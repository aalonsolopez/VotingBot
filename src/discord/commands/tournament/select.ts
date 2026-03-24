import type { ChatInputCommandInteraction } from "discord.js";
import { createTournamentSelect } from "../../components/tournamentSelect.js";

async function respond(i: ChatInputCommandInteraction, content: string | { content?: string; components?: any[] }) {
  // 64 = MessageFlags.Ephemeral
  const options = typeof content === 'string' 
    ? { content, flags: 64 }
    : { ...content, flags: 64 };
    
  if (i.deferred) return i.editReply(options);
  if (i.replied) return i.followUp(options);
  return i.reply(options);
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
    return respond(i, {
      content: "Selecciona un torneo para ver sus predicciones:",
      components: [row],
    });
    
  } catch (error) {
    console.error("Error creating tournament select:", error);
    return respond(i, "❌ Error al cargar torneos.");
  }
}