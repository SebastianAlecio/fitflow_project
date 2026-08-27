import { Router, Request } from "express";
import { prisma } from "../lib/prisma";
import { CorrelatedRequest } from "../middleware/correlation";
import { logEvent } from "../lib/logger";

const router = Router();

router.post("/", async (req: Request, res) => {
  const correlatedReq = req as CorrelatedRequest;
  const { userId, message, channel } = req.body ?? {};
  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }

  const notification = await prisma.notification.create({
    data: { userId: Number(userId), message, channel: channel || "log" },
  });

  logEvent(correlatedReq.correlationId, "notification_sent", "info", {
    user_id: notification.userId,
    channel: notification.channel,
  });

  return res.status(201).json(notification);
});

router.get("/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return res.json(notifications);
});

export default router;
