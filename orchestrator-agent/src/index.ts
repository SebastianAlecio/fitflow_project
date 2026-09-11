import "dotenv/config";
import express from "express";
import "express-async-errors";
import { agentCard } from "./lib/agent-card";
import instructionsRouter from "./routes/instructions";

const app = express();
app.use(express.json());

app.get("/.well-known/agent.json", (_req, res) => {
  res.json(agentCard);
});

app.use("/instructions", instructionsRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

const PORT = Number(process.env.PORT || 9000);

app.listen(PORT, () => {
  console.log(`orchestrator-agent listening on port ${PORT}`);
});
