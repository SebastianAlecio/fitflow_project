import "dotenv/config";
import express from "express";
import "express-async-errors";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";
import { seedClasses } from "./lib/seed";
import { correlationMiddleware, CorrelatedRequest } from "./middleware/correlation";
import { logEvent } from "./lib/logger";
import classesRouter from "./routes/classes";
import bookingsRouter from "./routes/bookings";

const app = express();
app.use(express.json());
app.use(correlationMiddleware);

app.use("/classes", classesRouter);
app.use("/bookings", bookingsRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = (req as CorrelatedRequest).correlationId ?? "startup";
  logEvent(correlationId, "unhandled_error", "error", { error: String(err) });
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT || 8001);

async function registerWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await registerService({
        id: "booking-svc-1",
        name: "booking-svc",
        address: "booking-svc",
        port: PORT,
      });
      logEvent("startup", "consul_registered", "info", { attempt });
      return;
    } catch (err) {
      logEvent("startup", "consul_registration_failed", "error", { attempt, maxAttempts: 5, error: String(err) });
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  logEvent("startup", "consul_registration_gave_up", "error", { attempts: 5 });
}

app.listen(PORT, async () => {
  logEvent("startup", "service_listening", "info", { port: PORT });

  try {
    await seedClasses();
  } catch (err) {
    logEvent("startup", "seed_failed", "error", { error: String(err) });
  }

  await registerWithRetry();
  setInterval(() => {
    registerService({
      id: "booking-svc-1",
      name: "booking-svc",
      address: "booking-svc",
      port: PORT,
    }).catch((err) => logEvent("startup", "consul_reregistration_failed", "error", { error: String(err) }));
  }, 30_000);
});
