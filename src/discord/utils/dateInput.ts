export function parseDateInput(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Formato: DD-MM-YYYY HH:MM (en hora local del servidor)
  const m = /^([0-3]\d)-([0-1]\d)-(\d{4})\s+([0-2]\d):([0-5]\d)$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);

    if (month < 1 || month > 12) return null;
    if (hour > 23) return null;

    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      return null;
    }

    return date;
  }

  const date = new Date(s);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}
