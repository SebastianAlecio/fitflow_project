import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (_req, res) => {
  const classes = await prisma.class.findMany({ orderBy: { schedule: "asc" } });
  res.json(classes);
});

export default router;
