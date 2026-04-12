import { Router, type Request, type Response } from "express";

export const discogsRouter = Router();

const UA = "RecordCollectionApp/1.0";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** GET /api/discogs — Proxy to Discogs collection endpoint. */
discogsRouter.get("/", async (req: Request, res: Response) => {
  const username = req.query.username as string | undefined;
  const token = req.query.token as string | undefined;
  const page = (req.query.page as string) ?? "1";
  const perPage = (req.query.per_page as string) ?? "100";

  if (!username || !token) {
    res.status(400).json({ error: "username and token are required" });
    return;
  }

  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=artist&sort_order=asc`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${token}`,
        "User-Agent": UA,
      },
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error: (data as { message?: string }).message || "Discogs API error",
      });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch from Discogs" });
  }
});

/** GET /api/discogs/wantlist — Proxy to Discogs wantlist endpoint. */
discogsRouter.get("/wantlist", async (req: Request, res: Response) => {
  const username = req.query.username as string | undefined;
  const token = req.query.token as string | undefined;
  const page = (req.query.page as string) ?? "1";
  const perPage = (req.query.per_page as string) ?? "100";

  if (!username || !token) {
    res.status(400).json({ error: "username and token are required" });
    return;
  }

  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?page=${page}&per_page=${perPage}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${token}`,
        "User-Agent": UA,
      },
    });

    // Parse body safely — Discogs can return HTML error pages when rate limited
    let data: unknown;
    try {
      data = await apiRes.json();
    } catch {
      res.status(apiRes.status).json({
        error:
          apiRes.status === 429
            ? "Rate limited by Discogs"
            : "Discogs returned an unexpected response",
      });
      return;
    }

    if (!apiRes.ok) {
      const msg =
        (data as { message?: string })?.message ||
        (apiRes.status === 429 ? "Rate limited by Discogs" : "Discogs API error");
      res.status(apiRes.status).json({ error: msg });
      return;
    }

    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch from Discogs" });
  }
});

// ── add-to-wantlist ──────────────────────────────────────────────────────────

const ADD_DELAY_MS = 500;

function discogsHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Discogs token=${token}`,
    "User-Agent": UA,
    "Content-Type": "application/json",
  };
}

async function findMasterId(
  artist: string,
  title: string,
  headers: Record<string, string>
): Promise<number | null> {
  const searchUrl = new URL("https://api.discogs.com/database/search");
  searchUrl.searchParams.set("artist", artist);
  searchUrl.searchParams.set("release_title", title);
  searchUrl.searchParams.set("type", "master");
  searchUrl.searchParams.set("per_page", "5");

  try {
    const apiRes = await fetch(searchUrl.toString(), { headers });
    if (apiRes.ok) {
      const data = (await apiRes.json()) as { results?: Array<{ id: number; type: string }> };
      const id = data.results?.find((r) => r.type === "master")?.id;
      if (id) return id;
    }
  } catch { /* fall through */ }

  await sleep(600);
  const fbUrl = new URL("https://api.discogs.com/database/search");
  fbUrl.searchParams.set("q", `${artist} ${title}`);
  fbUrl.searchParams.set("type", "master");
  fbUrl.searchParams.set("per_page", "5");

  try {
    const apiRes = await fetch(fbUrl.toString(), { headers });
    if (apiRes.ok) {
      const data = (await apiRes.json()) as { results?: Array<{ id: number }> };
      return data.results?.[0]?.id ?? null;
    }
  } catch { /* continue */ }

  return null;
}

async function fetchVinylIds(
  masterId: number,
  headers: Record<string, string>
): Promise<number[]> {
  const ids: number[] = [];

  for (let page = 1; page <= 2; page++) {
    if (page > 1) await sleep(600);

    const url = new URL(`https://api.discogs.com/masters/${masterId}/versions`);
    url.searchParams.set("format", "Vinyl");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    try {
      const apiRes = await fetch(url.toString(), { headers });
      if (!apiRes.ok) break;

      const data = (await apiRes.json()) as {
        versions?: Array<{ id: number; major_formats?: string[] }>;
        pagination?: { pages: number };
      };

      for (const v of data.versions ?? []) {
        if (v.major_formats?.some((f) => f.toLowerCase() === "vinyl")) {
          ids.push(v.id);
        }
      }

      if (page >= (data.pagination?.pages ?? 1)) break;
    } catch {
      break;
    }
  }

  return ids;
}

async function addToWantlist(
  releaseIds: number[],
  username: string,
  headers: Record<string, string>
): Promise<number[]> {
  const added: number[] = [];

  for (let i = 0; i < releaseIds.length; i++) {
    if (i > 0) await sleep(ADD_DELAY_MS);

    const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants/${releaseIds[i]}`;
    try {
      const apiRes = await fetch(url, { method: "PUT", headers });

      if (apiRes.status === 201 || apiRes.status === 200 || apiRes.status === 422) {
        added.push(releaseIds[i]);
      } else if (apiRes.status === 429) {
        await sleep(10_000);
        const retry = await fetch(url, { method: "PUT", headers });
        if (retry.status === 201 || retry.status === 200 || retry.status === 422) {
          added.push(releaseIds[i]);
        }
      }
    } catch { /* skip */ }
  }

  return added;
}

/** POST /api/discogs/add-to-wantlist */
discogsRouter.post("/add-to-wantlist", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { username, token } = body as { username?: string; token?: string };
  if (!username || !token) {
    res.status(400).json({ error: "username and token are required" });
    return;
  }

  const headers = discogsHeaders(token);

  // Direct-add mode
  if (Array.isArray(body.releaseIds) && body.releaseIds.length > 0) {
    const ids = body.releaseIds as number[];
    const added = await addToWantlist(ids, username, headers);
    res.json({
      vinylVersions: ids.length,
      added: added.length,
      releaseIds: added,
    });
    return;
  }

  // Search-based modes
  const { artist, title, preview } = body as {
    artist?: string;
    title?: string;
    preview?: boolean;
  };
  if (!artist || !title) {
    res.status(400).json({
      error: "artist and title are required when releaseIds are not provided",
    });
    return;
  }

  const masterId = await findMasterId(artist, title, headers);
  if (!masterId) {
    res.status(404).json({
      error: `Could not find "${title}" by "${artist}" on Discogs. Try searching manually at discogs.com.`,
    });
    return;
  }

  const vinylIds = await fetchVinylIds(masterId, headers);
  if (vinylIds.length === 0) {
    res.status(404).json({
      error: `No vinyl versions found for "${title}" on Discogs. The album may only exist on CD or digital.`,
    });
    return;
  }

  if (preview) {
    res.json({ masterId, vinylVersions: vinylIds.length, releaseIds: vinylIds });
    return;
  }

  const added = await addToWantlist(vinylIds, username, headers);
  res.json({
    masterId,
    vinylVersions: vinylIds.length,
    added: added.length,
    releaseIds: added,
  });
});
