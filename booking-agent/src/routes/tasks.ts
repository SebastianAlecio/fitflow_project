import { Router } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { logEvent } from "../lib/logger.js";

const router = Router();

router.post("/", async (req, res) => {
  const { taskId, skillId, input } = req.body ?? {};
  if (!taskId || !skillId) {
    return res.status(400).json({ error: "taskId and skillId are required" });
  }

  logEvent(taskId, "a2a_task_received", "info", { skill: skillId, input });

  if (skillId === "create_booking") {
    const { userId, className } = input ?? {};
    if (typeof userId !== "number" || typeof className !== "string") {
      return res
        .status(400)
        .json({ error: "input.userId (number) and input.className (string) are required" });
    }

    try {
      const classesResult = (await callMcpTool("get_available_classes", {})) as Array<{
        id: number;
        name: string;
      }>;
      const match = classesResult.find(
        (c) => c.name.toLowerCase() === className.toLowerCase()
      );

      if (!match) {
        const error = `No se encontró una clase llamada '${className}'`;
        logEvent(taskId, "a2a_task_completed", "warn", { skill: skillId, status: "failed", error });
        return res.json({ taskId, status: "failed", error });
      }

      const booking = await callMcpTool("create_booking", { userId, classId: match.id });
      logEvent(taskId, "a2a_task_completed", "info", { skill: skillId, status: "completed" });
      return res.json({ taskId, status: "completed", output: booking });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logEvent(taskId, "a2a_task_completed", "error", { skill: skillId, status: "failed", error });
      return res.json({ taskId, status: "failed", error });
    }
  }

  if (skillId === "cancel_booking") {
    const { userId, bookingId } = input ?? {};
    if (typeof userId !== "number" || typeof bookingId !== "number") {
      return res
        .status(400)
        .json({ error: "input.userId (number) and input.bookingId (number) are required" });
    }

    try {
      const result = await callMcpTool("cancel_booking", { userId, bookingId });
      logEvent(taskId, "a2a_task_completed", "info", { skill: skillId, status: "completed" });
      return res.json({ taskId, status: "completed", output: result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logEvent(taskId, "a2a_task_completed", "error", { skill: skillId, status: "failed", error });
      return res.json({ taskId, status: "failed", error });
    }
  }

  return res.status(400).json({ error: `Unknown skillId: ${skillId}` });
});

export default router;
