import pino from "pino";

const SERVICE_NAME = "booking-svc";

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
  correlationId: string,
  event: string,
  level: "info" | "warn" | "error" = "info",
  extra?: Record<string, unknown>
): void {
  rawLogger[level]({
    correlation_id: correlationId,
    service: SERVICE_NAME,
    event,
    ...extra,
  });
}
