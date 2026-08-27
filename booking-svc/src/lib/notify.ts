import { discoverService } from "./consul";
import { logEvent } from "./logger";

export async function notifyBookingCreated(
  userId: number,
  classId: number,
  correlationId: string
): Promise<void> {
  try {
    const notif = await discoverService("notif-svc");
    const res = await fetch(`http://${notif.address}:${notif.port}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        userId,
        message: `Tu reserva para la clase ${classId} fue confirmada.`,
        channel: "log",
      }),
    });
    if (!res.ok) {
      logEvent(correlationId, "notification_failed", "error", { userId, classId, status: res.status });
      return;
    }
    logEvent(correlationId, "notification_delivered", "info", { userId, classId });
  } catch (err) {
    logEvent(correlationId, "notification_failed", "error", { userId, classId, error: String(err) });
  }
}
