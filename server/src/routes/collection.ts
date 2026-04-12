import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const collectionRouter = Router();

collectionRouter.use(requireAuth);

/** GET /api/user/collection — Return cached Discogs collection. */
collectionRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const cached = await prisma.cachedCollection.findUnique({ where: { userId } });
    if (!cached) {
      res.json({ releases: [], fetchedAt: null });
      return;
    }
    res.json({ releases: cached.releases, fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("GET /api/user/collection error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/user/collection — Save/update cached collection. */
collectionRouter.put("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { releases } = req.body ?? {};
    if (!Array.isArray(releases)) {
      res.status(400).json({ error: "releases must be an array" });
      return;
    }

    const cached = await prisma.cachedCollection.upsert({
      where: { userId },
      update: { releases, fetchedAt: new Date() },
      create: { userId, releases, fetchedAt: new Date() },
    });

    res.json({ fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("PUT /api/user/collection error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});
