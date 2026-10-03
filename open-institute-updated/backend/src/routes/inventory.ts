import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const inventoryRouter = Router();

// ---------------------------------------------------------------------------
// FN032 — inventory: consumable/stock items, distinct from the fixed Asset
// register in procurement.ts. quantityOnHand is only ever changed inside
// the same transaction that creates the InventoryTransaction row that
// justifies the change — it is a real stock ledger, not a bare counter.
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  unit: z.string().min(1),
  reorderLevel: z.number().int().min(0).default(0),
  location: z.string().optional(),
});

inventoryRouter.get(
  "/items",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
    res.json(items.map((i) => ({ ...i, lowStock: i.quantityOnHand <= i.reorderLevel })));
  }
);

inventoryRouter.post(
  "/items",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide name, category, and unit." });
    const item = await prisma.inventoryItem.create({ data: parsed.data });
    res.status(201).json(item);
  }
);

const transactionSchema = z.object({
  itemId: z.string(),
  type: z.enum(["restock", "consumption", "adjustment"]),
  quantity: z.number().int(),
  note: z.string().optional(),
});

inventoryRouter.post(
  "/transactions",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide itemId, type, and a non-zero quantity." });
    if (parsed.data.quantity === 0) return res.status(400).json({ message: "Quantity cannot be zero." });

    // restock is always a positive movement, consumption is always negative,
    // regardless of the sign the caller sent — this keeps the ledger honest
    // even if a client sends the wrong sign.
    const signedQuantity =
      parsed.data.type === "restock"
        ? Math.abs(parsed.data.quantity)
        : parsed.data.type === "consumption"
          ? -Math.abs(parsed.data.quantity)
          : parsed.data.quantity;

    const item = await prisma.inventoryItem.findUnique({ where: { id: parsed.data.itemId } });
    if (!item) return res.status(404).json({ message: "Inventory item not found." });
    if (item.quantityOnHand + signedQuantity < 0) {
      return res.status(400).json({ message: "This would take quantity on hand below zero." });
    }

    const [transaction] = await prisma.$transaction([
      prisma.inventoryTransaction.create({
        data: { itemId: parsed.data.itemId, type: parsed.data.type, quantity: signedQuantity, note: parsed.data.note, recordedById: req.user!.id },
      }),
      prisma.inventoryItem.update({
        where: { id: parsed.data.itemId },
        data: { quantityOnHand: { increment: signedQuantity } },
      }),
    ]);

    res.status(201).json(transaction);
  }
);

inventoryRouter.get(
  "/items/:id/transactions",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { itemId: req.params.id },
      orderBy: { recordedAt: "desc" },
    });
    res.json(transactions);
  }
);
