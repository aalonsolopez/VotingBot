import fs from "node:fs";

const logFile = process.env.LOG_FILE;

function ts() {
  return new Date().toISOString();
}

function writeToFile(line: string) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line + "\n", { encoding: "utf8" });
  } catch {
    // ignore
  }
}

function format(level: string, args: unknown[]) {
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");

  return `[${ts()}] ${level} ${msg}`;
}

export const log = {
  info: (...args: unknown[]) => {
    const line = format("INFO", args);
    console.log(line);
    writeToFile(line);
  },
  warn: (...args: unknown[]) => {
    const line = format("WARN", args);
    console.warn(line);
    writeToFile(line);
  },
  error: (...args: unknown[]) => {
    const line = format("ERROR", args);
    console.error(line);
    writeToFile(line);
  },
};
