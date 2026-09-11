import { Router } from "express";
import { randomUUID } from "crypto";
import { parseInstruction } from "../lib/parser";
import { runIntents } from "../lib/delegate";
import { logEvent } from "../lib/logger";

const router = Router();

router.post("/", async (req, res) => {
  const { userId, instruction } = req.body ?? {};
  if (typeof userId !== "number" || typeof instruction !== "string") {
    return res.status(400).json({ error: "userId (number) and instruction (string) are required" });
  }

  const taskId = randomUUID();
  logEvent(taskId, "orchestrator_received_instruction", "info", { user_id: userId, instruction });

  const intents = parseInstruction(instruction);
  if (intents.length === 0) {
    logEvent(taskId, "orchestrator_could_not_parse", "warn", { instruction });
    return res.status(400).json({ error: "No pude interpretar la instrucción" });
  }

  const results = await runIntents(taskId, userId, intents);

  return res.json({ taskId, results });
});

export default router;
