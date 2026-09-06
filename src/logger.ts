export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  (level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
}

/** JSON-lines logger writing to stderr (stdout is reserved for the stdio transport). */
export function createLogger(minLevel: string = "info"): Logger {
  const min = ORDER[(minLevel as LogLevel) in ORDER ? (minLevel as LogLevel) : "info"];
  return (level, msg, meta) => {
    if (ORDER[level] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta || {}) });
    process.stderr.write(line + "\n");
  };
}
