import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import {
  encrypt,
  setSessionCookie,
  clearSessionCookie,
  getSessionUserId,
  requireAuth,
} from "../auth.js";

export const userRouter = Router();

/**
 * POST /api/user — Login / register via Discogs credentials.
 * Verifies the token against the Discogs API, upserts a User row,
 * and sets a session cookie.
 */
userRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { username, token } = req.body ?? {};
    if (!username || !token) {
      res.status(400).json({ error: "username and token are required" });
      return;
    }

    // Verify credentials against Discogs using the identity endpoint,
    // which requires valid auth and returns the token owner's username.
    const verify = await fetch(
      "https://api.discogs.com/oauth/identity",
      {
        headers: {
          Authorization: `Discogs token=${token}`,
          "User-Agent": "RecordCollectionApp/1.0",
        },
      }
    );
    if (!verify.ok) {
      res.status(401).json({ error: "Invalid Discogs credentials" });
      return;
    }
    const identity = (await verify.json()) as { username?: string };
    if (
      !identity.username ||
      identity.username.toLowerCase() !== username.toLowerCase()
    ) {
      res
        .status(401)
        .json({ error: "Token does not belong to this user" });
      return;
    }

    const user = await prisma.user.upsert({
      where: { discogsUsername: username },
      update: { discogsToken: encrypt(token) },
      create: {
        discogsUsername: username,
        discogsToken: encrypt(token),
      },
    });

    setSessionCookie(res, user.id);
    res.json({ id: user.id, discogsUsername: user.discogsUsername });
  } catch (e) {
    console.error("POST /api/user error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/user — Return current session user info.
 */
userRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, discogsUsername: true, spotifyClientId: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (e) {
    console.error("GET /api/user error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/user — Logout.
 */
userRouter.delete("/", requireAuth, (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
