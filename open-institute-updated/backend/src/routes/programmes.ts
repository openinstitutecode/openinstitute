import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const programmesRouter = Router();

programmesRouter.get("/", async (_req, res) => {
  const programmes = await prisma.programme.findMany({
    where: { approvalStatus: { not: "withdrawn" } },
    include: { units: true },
    orderBy: { name: "asc" },
  });
  res.json(programmes);
});

programmesRouter.get("/:slug", async (req, res) => {
  const programme = await prisma.programme.findUnique({
    where: { slug: req.params.slug },
    include: { units: true },
  });
  if (!programme) return res.status(404).json({ message: "Programme not found." });
  res.json(programme);
});
