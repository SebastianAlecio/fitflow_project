import "dotenv/config";
import express from "express";
import "express-async-errors";
import { prisma } from "./lib/prisma";
import { registerService } from "./lib/consul";
import usersRouter from "./routes/users";

const app = express();
app.use(express.json());

app.use("/users", usersRouter);

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

const PORT = Number(process.env.PORT || 8003);

async function registerWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await registerService({
        id: "users-svc-1",
        name: "users-svc",
        address: "users-svc",
        port: PORT,
      });
      console.log("users-svc registered in Consul");
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
  console.log(`users-svc listening on port ${PORT}`);
  await registerWithRetry();
  setInterval(() => {
    registerService({
      id: "users-svc-1",
      name: "users-svc",
      address: "users-svc",
      port: PORT,
    }).catch((err) => console.error("Consul re-registration failed:", err));
  }, 30_000);
});
