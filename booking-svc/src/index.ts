import "dotenv/config";
import express from "express";
import "express-async-errors";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";
import { seedClasses } from "./lib/seed";
import classesRouter from "./routes/classes";
import bookingsRouter from "./routes/bookings";

const app = express();
app.use(express.json());

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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
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
      console.log("booking-svc registered in Consul");
      return;
    } catch (err) {
      console.error(`Consul registration attempt ${attempt}/5 failed:`, err);
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  console.error("Giving up on initial Consul registration after 5 attempts");
}

app.listen(PORT, async () => {
  console.log(`booking-svc listening on port ${PORT}`);

  try {
    await seedClasses();
  } catch (err) {
    console.error("Failed to seed classes:", err);
  }

  await registerWithRetry();
  setInterval(() => {
    registerService({
      id: "booking-svc-1",
      name: "booking-svc",
      address: "booking-svc",
      port: PORT,
    }).catch((err) => console.error("Consul re-registration failed:", err));
  }, 30_000);
});
