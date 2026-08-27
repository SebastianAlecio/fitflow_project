import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { notifyBookingCreated } from "../lib/notify";
import { CorrelatedRequest } from "../middleware/correlation";
import { logEvent } from "../lib/logger";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const typedReq = req as AuthedRequest & CorrelatedRequest;
  const { classId } = req.body ?? {};
  if (!classId) {
    return res.status(400).json({ error: "classId is required" });
  }

  const klass = await prisma.class.findUnique({ where: { id: Number(classId) } });
  if (!klass) {
    return res.status(404).json({ error: "Class not found" });
  }
  if (klass.booked >= klass.capacity) {
    return res.status(409).json({ error: "Class is full" });
  }

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: { userId: typedReq.userId as number, classId: klass.id },
    });
    await tx.class.update({
      where: { id: klass.id },
      data: { booked: { increment: 1 } },
    });
    return created;
  });

  logEvent(typedReq.correlationId, "booking_created", "info", {
    user_id: booking.userId,
    booking_id: booking.id,
    class_id: booking.classId,
  });

  void notifyBookingCreated(booking.userId, booking.classId, typedReq.correlationId);

  return res.status(201).json(booking);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  return res.json(booking);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const typedReq = req as AuthedRequest & CorrelatedRequest;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.userId !== typedReq.userId) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status === "cancelled") {
    return res.json(booking);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });
    await tx.class.update({
      where: { id: booking.classId },
      data: { booked: { decrement: 1 } },
    });
    return cancelled;
  });

  logEvent(typedReq.correlationId, "booking_cancelled", "info", {
    user_id: typedReq.userId,
    booking_id: updated.id,
  });

  return res.json(updated);
});

export default router;
