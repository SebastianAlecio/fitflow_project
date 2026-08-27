import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  circuitBreaker,
  handleAll,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
} from "cockatiel";
import { discoverService } from "./consul";
import { logEvent } from "./logger";
import { prisma } from "./prisma";

const retryPolicy = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 2000 }),
});

const circuitBreakerPolicy = circuitBreaker(handleAll, {
  halfOpenAfter: 30_000,
  breaker: new ConsecutiveBreaker(3),
});

circuitBreakerPolicy.onBreak(() => {
  logEvent("circuit-breaker", "circuit_breaker_opened", "warn");
});
circuitBreakerPolicy.onReset(() => {
  logEvent("circuit-breaker", "circuit_breaker_closed", "info");
});
circuitBreakerPolicy.onHalfOpen(() => {
  logEvent("circuit-breaker", "circuit_breaker_half_open", "info");
});

const timeoutPolicy = timeout(2000, TimeoutStrategy.Aggressive);

const notifyPolicy = wrap(retryPolicy, circuitBreakerPolicy, timeoutPolicy);

export async function notifyBookingCreated(
  userId: number,
  classId: number,
  correlationId: string
): Promise<void> {
  const message = `Tu reserva para la clase ${classId} fue confirmada.`;

  try {
    await notifyPolicy.execute(async ({ signal }) => {
      const notif = await discoverService("notif-svc");
      const res = await fetch(`http://${notif.address}:${notif.port}/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({ userId, message, channel: "log" }),
        signal,
      });
      if (!res.ok) {
        throw new Error(`notif-svc responded with ${res.status}`);
      }
    });
    logEvent(correlationId, "notification_delivered", "info", { userId, classId });
  } catch (err) {
    logEvent(correlationId, "notification_failed", "error", {
      userId,
      classId,
      error: String(err),
      circuitBreakerState: circuitBreakerPolicy.state,
    });
    try {
      await prisma.notificationOutbox.create({
        data: { userId, classId, message, status: "pending" },
      });
    } catch (outboxErr) {
      logEvent(correlationId, "outbox_write_failed", "error", {
        userId,
        classId,
        error: String(outboxErr),
      });
    }
  }
}
