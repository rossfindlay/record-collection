import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const playlistsRouter = Router();

playlistsRouter.use(requireAuth);

/** GET /api/user/playlists — List all playlists for the current user. */
playlistsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ playlists });
  } catch (e) {
    console.error("GET /api/user/playlists error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/user/playlists — Create a new playlist. */
playlistsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { name, releaseIds } = req.body ?? {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: name.trim(),
        releaseIds: releaseIds ?? [],
      },
    });

    res.status(201).json({ playlist });
  } catch (e) {
    console.error("POST /api/user/playlists error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/user/playlists — Update a playlist. */
playlistsRouter.put("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { id, name, releaseIds } = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const existing = await prisma.playlist.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(releaseIds !== undefined && { releaseIds }),
      },
    });

    res.json({ playlist: updated });
  } catch (e) {
    console.error("PUT /api/user/playlists error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /api/user/playlists — Delete a playlist. */
playlistsRouter.delete("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { id } = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const existing = await prisma.playlist.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    await prisma.playlist.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/user/playlists error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});
