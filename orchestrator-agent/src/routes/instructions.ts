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

  const { intents, unresolvedPrimary } = parseInstruction(instruction);

  if (unresolvedPrimary === "cancel_booking") {
    logEvent(taskId, "orchestrator_could_not_parse", "warn", { instruction, reason: "cancel_booking sin número de reserva" });
    return res.status(400).json({ error: "Detecté que querés cancelar una reserva, pero no encontré el número de reserva en la instrucción" });
  }
  if (unresolvedPrimary === "create_booking") {
    logEvent(taskId, "orchestrator_could_not_parse", "warn", { instruction, reason: "create_booking sin nombre de clase reconocido" });
    return res.status(400).json({ error: "Detecté que querés reservar una clase, pero no reconocí el nombre de la clase en la instrucción" });
  }
  if (intents.length === 0) {
    logEvent(taskId, "orchestrator_could_not_parse", "warn", { instruction });
    return res.status(400).json({ error: "No pude interpretar la instrucción" });
  }

  const results = await runIntents(taskId, userId, intents);

  return res.json({ taskId, results });
});

export default router;
