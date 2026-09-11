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

  if (skillId === "send_notification") {
    const { userId, message } = input ?? {};
    if (typeof userId !== "number" || typeof message !== "string") {
      return res
        .status(400)
        .json({ error: "input.userId (number) and input.message (string) are required" });
    }

    try {
      const result = await callMcpTool("send_notification", { userId, message });
      logEvent(taskId, "a2a_task_completed", "info", { skill: skillId, status: "completed" });
      return res.json({ taskId, status: "completed", output: result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logEvent(taskId, "a2a_task_completed", "error", { skill: skillId, status: "failed", error });
      return res.json({ taskId, status: "failed", error });
    }
  }

  if (skillId === "get_history") {
    const { userId } = input ?? {};
    if (typeof userId !== "number") {
      return res.status(400).json({ error: "input.userId (number) is required" });
    }

    try {
      const result = await callMcpTool("get_notification_history", { userId });
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
