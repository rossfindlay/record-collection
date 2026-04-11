import { NextRequest, NextResponse } from "next/server";

const UA = "RecordCollectionApp/1.0";

function discogsHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Discogs token=${token}`,
    "User-Agent": UA,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Discogs rate limit is 60 authenticated requests per minute.
// We pace adds at ~500ms apart so a typical album (10-30 vinyl releases)
// completes in 5–15 s, well within the limit.
const ADD_DELAY_MS = 500;

type Body =
  | {
      // Preview mode: find all vinyl version IDs but don't add them yet.
      username: string;
      token: string;
      artist: string;
      title: string;
      preview: true;
      releaseIds?: never;
    }
  | {
      // Direct-add mode: skip the Discogs search and add the supplied IDs.
      // Used when the client already has the IDs from a preview call.
      username: string;
      token: string;
      releaseIds: number[];
      artist?: never;
      title?: never;
      preview?: never;
    }
  | {
      // Combined mode (no preview): find IDs and add in one shot.
      username: string;
      token: string;
      artist: string;
      title: string;
      preview?: false;
      releaseIds?: never;
    };

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, token } = body as { username?: string; token?: string };
  if (!username || !token) {
    return NextResponse.json(
      { error: "username and token are required" },
      { status: 400 }
    );
  }

  const headers = discogsHeaders(token);

  // ── Direct-add mode ──────────────────────────────────────────────────────────
  // Client already has the vinyl release IDs (from a prior preview call).

  if (Array.isArray(body.releaseIds) && (body.releaseIds as number[]).length > 0) {
    const ids = body.releaseIds as number[];
    const added = await addToWantlist(ids, username, headers);
    return NextResponse.json({
      vinylVersions: ids.length,
      added: added.length,
      releaseIds: added,
    });
  }

  // ── Search-based modes ───────────────────────────────────────────────────────

  const { artist, title, preview } = body as Body & { preview?: boolean };
  if (!artist || !title) {
    return NextResponse.json(
      { error: "artist and title are required when releaseIds are not provided" },
      { status: 400 }
    );
  }

  // Step 1: Find the master release ID
  const masterId = await findMasterId(artist, title, headers);
  if (!masterId) {
    return NextResponse.json(
      {
        error: `Could not find "${title}" by "${artist}" on Discogs. Try searching manually at discogs.com.`,
      },
      { status: 404 }
    );
  }

  // Step 2: Collect vinyl release IDs from the master
  const vinylIds = await fetchVinylIds(masterId, headers);
  if (vinylIds.length === 0) {
    return NextResponse.json(
      {
        error: `No vinyl versions found for "${title}" on Discogs. The album may only exist on CD or digital.`,
      },
      { status: 404 }
    );
  }

  // Preview mode: return IDs without adding so the client can confirm first.
  if (preview) {
    return NextResponse.json({ masterId, vinylVersions: vinylIds.length, releaseIds: vinylIds });
  }

  // Combined mode: add immediately.
  const added = await addToWantlist(vinylIds, username, headers);
  return NextResponse.json({
    masterId,
    vinylVersions: vinylIds.length,
    added: added.length,
    releaseIds: added,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findMasterId(
  artist: string,
  title: string,
  headers: Record<string, string>
): Promise<number | null> {
  // Precise search first
  const searchUrl = new URL("https://api.discogs.com/database/search");
  searchUrl.searchParams.set("artist", artist);
  searchUrl.searchParams.set("release_title", title);
  searchUrl.searchParams.set("type", "master");
  searchUrl.searchParams.set("per_page", "5");

  try {
    const res = await fetch(searchUrl.toString(), { headers });
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<{ id: number; type: string }> };
      const id = data.results?.find((r) => r.type === "master")?.id;
      if (id) return id;
    }
  } catch { /* fall through */ }

  // Broader keyword fallback
  await sleep(600);
  const fbUrl = new URL("https://api.discogs.com/database/search");
  fbUrl.searchParams.set("q", `${artist} ${title}`);
  fbUrl.searchParams.set("type", "master");
  fbUrl.searchParams.set("per_page", "5");

  try {
    const res = await fetch(fbUrl.toString(), { headers });
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<{ id: number }> };
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
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) break;

      const data = (await res.json()) as {
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
      const res = await fetch(url, { method: "PUT", headers });

      if (res.status === 201 || res.status === 200 || res.status === 422) {
        // 201 = created, 200 = updated, 422 = already in wantlist
        added.push(releaseIds[i]);
      } else if (res.status === 429) {
        await sleep(10_000);
        const retry = await fetch(url, { method: "PUT", headers });
        if (retry.status === 201 || retry.status === 200 || retry.status === 422) {
          added.push(releaseIds[i]);
        }
      }
      // Other failures are silently skipped — one bad release shouldn't abort the batch.
    } catch { /* skip */ }
  }

  return added;
}
