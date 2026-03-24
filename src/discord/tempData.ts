// Almacenamiento temporal para datos de comandos que requieren selección de torneo
// Clave: `${guildId}:${userId}:${command}` 
// Valor: datos del comando

interface CommandData {
  command: string;
  params: Record<string, any>;
  timestamp: number;
  expiresAt: number;
}

const tempStorage = new Map<string, CommandData>();

// Limpiar datos expirados cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of tempStorage.entries()) {
    if (now > data.expiresAt) {
      tempStorage.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function saveCommandData(
  guildId: string,
  userId: string,
  command: string,
  params: Record<string, any>,
  ttlMinutes: number = 10
): string {
  const key = `${guildId}:${userId}:${command}`;
  const data: CommandData = {
    command,
    params,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
  };
  
  tempStorage.set(key, data);
  return key;
}

export function getCommandData(guildId: string, userId: string, command: string): CommandData | null {
  const key = `${guildId}:${userId}:${command}`;
  const data = tempStorage.get(key);
  
  if (!data) return null;
  
  if (Date.now() > data.expiresAt) {
    tempStorage.delete(key);
    return null;
  }
  
  return data;
}

export function deleteCommandData(guildId: string, userId: string, command: string): boolean {
  const key = `${guildId}:${userId}:${command}`;
  return tempStorage.delete(key);
}

export function generateKey(guildId: string, userId: string, command: string): string {
  return `${guildId}:${userId}:${command}`;
}