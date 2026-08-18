import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";
import { seedClasses } from "./lib/seed";

const app = express();
app.use(express.json());

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

const PORT = Number(process.env.PORT || 8001);

app.listen(PORT, async () => {
  console.log(`booking-svc listening on port ${PORT}`);

  try {
    await seedClasses();
  } catch (err) {
    console.error("Failed to seed classes:", err);
  }

  try {
    await registerService({
      id: "booking-svc-1",
      name: "booking-svc",
      address: "booking-svc",
      port: PORT,
    });
    console.log("booking-svc registered in Consul");
  } catch (err) {
    console.error("Failed to register booking-svc in Consul:", err);
  }
});
