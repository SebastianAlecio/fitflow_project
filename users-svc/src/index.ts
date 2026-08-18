import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";

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

const PORT = Number(process.env.PORT || 8003);

app.listen(PORT, async () => {
  console.log(`users-svc listening on port ${PORT}`);
  try {
    await registerService({
      id: "users-svc-1",
      name: "users-svc",
      address: "users-svc",
      port: PORT,
    });
    console.log("users-svc registered in Consul");
  } catch (err) {
    console.error("Failed to register users-svc in Consul:", err);
  }
});
