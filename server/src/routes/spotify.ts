import { Router, type Request, type Response } from "express";

export const spotifyRouter = Router();

/** POST /api/spotify/callback — Exchange auth code for tokens (PKCE). */
spotifyRouter.post("/callback", async (req: Request, res: Response) => {
  const { code, codeVerifier, redirectUri, clientId } = req.body ?? {};
  if (!code || !codeVerifier || !redirectUri || !clientId) {
    res.status(400).json({
      error: "code, codeVerifier, redirectUri and clientId are required",
    });
    return;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  try {
    const apiRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await apiRes.json();
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error: data.error_description || data.error || "Token exchange failed",
      });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to contact Spotify" });
  }
});

/** PUT /api/spotify/callback — Refresh access token. */
spotifyRouter.put("/callback", async (req: Request, res: Response) => {
  const { refreshToken, clientId } = req.body ?? {};
  if (!refreshToken || !clientId) {
    res.status(400).json({ error: "refreshToken and clientId are required" });
    return;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  try {
    const apiRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await apiRes.json();
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error: data.error_description || data.error || "Token refresh failed",
      });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to contact Spotify" });
  }
});

/** GET /api/spotify/top — Proxy /me/top/{type}. */
spotifyRouter.get("/top", async (req: Request, res: Response) => {
  const accessToken = req.query.access_token as string | undefined;
  const type = (req.query.type as string) ?? "tracks";
  const timeRange = (req.query.time_range as string) ?? "long_term";
  const limit = (req.query.limit as string) ?? "50";

  if (!accessToken) {
    res.status(400).json({ error: "access_token is required" });
    return;
  }
  if (type !== "tracks" && type !== "artists") {
    res.status(400).json({ error: "type must be tracks or artists" });
    return;
  }

  const url = `https://api.spotify.com/v1/me/top/${type}?time_range=${timeRange}&limit=${limit}`;

  try {
    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error:
          (data as { error?: { message?: string } })?.error?.message ||
          "Spotify API error",
      });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch from Spotify" });
  }
});

/** GET /api/spotify/playlists — Proxy /me/playlists or /playlists/{id}/items. */
spotifyRouter.get("/playlists", async (req: Request, res: Response) => {
  const accessToken = req.query.access_token as string | undefined;
  const playlistId = req.query.playlist_id as string | undefined;
  const limit = (req.query.limit as string) ?? "50";
  const offset = (req.query.offset as string) ?? "0";

  if (!accessToken) {
    res.status(400).json({ error: "access_token is required" });
    return;
  }

  const url = playlistId
    ? `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=${limit}&offset=${offset}`
    : `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;

  try {
    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error:
          (data as { error?: { message?: string } })?.error?.message ||
          "Spotify API error",
        spotifyStatus: apiRes.status,
      });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch from Spotify" });
  }
});
