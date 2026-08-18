import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { userId, message, channel } = req.body ?? {};
  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }

  const notification = await prisma.notification.create({
    data: { userId: Number(userId), message, channel: channel || "log" },
  });

  console.log(
    JSON.stringify({
      event: "notification_sent",
      userId: notification.userId,
      message: notification.message,
      channel: notification.channel,
    })
  );

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
