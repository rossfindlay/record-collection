import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const wantlistRouter = Router();

wantlistRouter.use(requireAuth);

/** GET /api/user/wantlist — Return cached wantlist. */
wantlistRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const cached = await prisma.cachedWantlist.findUnique({ where: { userId } });
    if (!cached) {
      res.json({ items: [], fetchedAt: null });
      return;
    }
    res.json({ items: cached.items, fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("GET /api/user/wantlist error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/user/wantlist — Save/update cached wantlist. */
wantlistRouter.put("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { items } = req.body ?? {};
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    const cached = await prisma.cachedWantlist.upsert({
      where: { userId },
      update: { items, fetchedAt: new Date() },
      create: { userId, items, fetchedAt: new Date() },
    });

    res.json({ fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("PUT /api/user/wantlist error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});
