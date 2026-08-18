import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";
import notificationsRouter from "./routes/notifications";

const app = express();
app.use(express.json());

app.use("/notifications", notificationsRouter);

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

const PORT = Number(process.env.PORT || 8002);

app.listen(PORT, async () => {
  console.log(`notif-svc listening on port ${PORT}`);
  try {
    await registerService({
      id: "notif-svc-1",
      name: "notif-svc",
      address: "notif-svc",
      port: PORT,
    });
    console.log("notif-svc registered in Consul");
  } catch (err) {
    console.error("Failed to register notif-svc in Consul:", err);
  }
});
