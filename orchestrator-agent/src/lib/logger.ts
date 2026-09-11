import pino from "pino";

const SERVICE_NAME = "orchestrator-agent";

const rawLogger = pino({
  base: null,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export function logEvent(
  taskId: string,
  event: string,
  level: "info" | "warn" | "error" = "info",
  extra?: Record<string, unknown>
): void {
  rawLogger[level]({
    correlation_id: taskId,
    service: SERVICE_NAME,
    event,
    ...extra,
  });
}
