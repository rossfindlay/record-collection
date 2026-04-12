import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { requireAuth, encrypt, decrypt } from "../auth.js";

export const spotifyUserRouter = Router();

spotifyUserRouter.use(requireAuth);

/** GET /api/user/spotify — Return cached Spotify data & tokens. */
spotifyUserRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const cached = await prisma.spotifyCache.findUnique({ where: { userId } });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { spotifyClientId: true },
    });

    if (!cached) {
      res.json({
        tokens: null,
        clientId: user?.spotifyClientId ?? null,
        topTracks: [],
        topAlbums: [],
        playlists: [],
      });
      return;
    }

    let tokens = null;
    if (cached.accessToken && cached.refreshToken && cached.expiresAt !== null) {
      tokens = {
        accessToken: decrypt(cached.accessToken),
        refreshToken: decrypt(cached.refreshToken),
        expiresAt: Number(cached.expiresAt),
      };
    }

    res.json({
      tokens,
      clientId: user?.spotifyClientId ?? null,
      topTracks: cached.topTracks ?? [],
      topAlbums: cached.topAlbums ?? [],
      playlists: cached.playlists ?? [],
    });
  } catch (e) {
    console.error("GET /api/user/spotify error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/user/spotify — Save Spotify tokens and/or cached data. */
spotifyUserRouter.put("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const body = req.body ?? {};

    const data: Record<string, unknown> = { fetchedAt: new Date() };

    if (body.tokens) {
      data.accessToken = encrypt(body.tokens.accessToken);
      data.refreshToken = encrypt(body.tokens.refreshToken);
      data.expiresAt = BigInt(body.tokens.expiresAt);
    }
    if (body.topTracks !== undefined) data.topTracks = body.topTracks;
    if (body.topAlbums !== undefined) data.topAlbums = body.topAlbums;
    if (body.playlists !== undefined) data.playlists = body.playlists;

    await prisma.spotifyCache.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    if (body.clientId !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: { spotifyClientId: body.clientId },
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/user/spotify error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /api/user/spotify — Clear all Spotify data for current user. */
spotifyUserRouter.delete("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    await prisma.spotifyCache.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { spotifyClientId: null },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/user/spotify error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});
