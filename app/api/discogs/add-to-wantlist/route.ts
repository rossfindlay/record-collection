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
// completes in 5–15 s, well inside the limit.
const ADD_DELAY_MS = 500;

export async function POST(req: NextRequest) {
  let body: { username?: string; token?: string; artist?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, token, artist, title } = body;
  if (!username || !token || !artist || !title) {
    return NextResponse.json(
      { error: "username, token, artist, and title are required" },
      { status: 400 }
    );
  }

  const headers = discogsHeaders(token);

  // ── Step 1: Find the master release ID ──────────────────────────────────────

  let masterId: number | null = null;

  // Precise search: artist + release_title fields
  const searchUrl = new URL("https://api.discogs.com/database/search");
  searchUrl.searchParams.set("artist", artist);
  searchUrl.searchParams.set("release_title", title);
  searchUrl.searchParams.set("type", "master");
  searchUrl.searchParams.set("per_page", "5");

  try {
    const res = await fetch(searchUrl.toString(), { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{ id: number; type: string }>;
      };
      masterId = data.results?.find((r) => r.type === "master")?.id ?? null;
    }
  } catch {
    /* fall through to broader search */
  }

  // Broader fallback: single q= keyword
  if (!masterId) {
    await sleep(600);
    const fbUrl = new URL("https://api.discogs.com/database/search");
    fbUrl.searchParams.set("q", `${artist} ${title}`);
    fbUrl.searchParams.set("type", "master");
    fbUrl.searchParams.set("per_page", "5");

    try {
      const res = await fetch(fbUrl.toString(), { headers });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ id: number }> };
        masterId = data.results?.[0]?.id ?? null;
      }
    } catch {
      /* continue */
    }
  }

  if (!masterId) {
    return NextResponse.json(
      {
        error: `Could not find "${title}" by "${artist}" on Discogs. Try searching manually at discogs.com.`,
      },
      { status: 404 }
    );
  }

  // ── Step 2: Collect vinyl release IDs from the master ───────────────────────
  // We request with format=Vinyl so Discogs pre-filters, then double-check
  // major_formats in each result for safety. One page (100 releases) covers
  // virtually every album; a second page is fetched only if more exist.

  const vinylIds: number[] = [];

  for (let page = 1; page <= 2; page++) {
    if (page > 1) await sleep(600);

    const vUrl = new URL(`https://api.discogs.com/masters/${masterId}/versions`);
    vUrl.searchParams.set("format", "Vinyl");
    vUrl.searchParams.set("per_page", "100");
    vUrl.searchParams.set("page", String(page));

    try {
      const res = await fetch(vUrl.toString(), { headers });
      if (!res.ok) break;

      const data = (await res.json()) as {
        versions?: Array<{ id: number; major_formats?: string[] }>;
        pagination?: { pages: number };
      };

      for (const v of data.versions ?? []) {
        if (v.major_formats?.some((f) => f.toLowerCase() === "vinyl")) {
          vinylIds.push(v.id);
        }
      }

      if (page >= (data.pagination?.pages ?? 1)) break;
    } catch {
      break;
    }
  }

  if (vinylIds.length === 0) {
    return NextResponse.json(
      {
        error: `No vinyl versions found for "${title}" on Discogs. The album may only exist on CD or digital.`,
      },
      { status: 404 }
    );
  }

  // ── Step 3: Add each vinyl release to the user's wantlist ───────────────────

  const added: number[] = [];

  for (let i = 0; i < vinylIds.length; i++) {
    if (i > 0) await sleep(ADD_DELAY_MS);

    const putUrl = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants/${vinylIds[i]}`;

    try {
      const res = await fetch(putUrl, { method: "PUT", headers });

      if (res.status === 201 || res.status === 200) {
        added.push(vinylIds[i]);
      } else if (res.status === 422) {
        // 422 typically means the release is already in the wantlist — count it.
        added.push(vinylIds[i]);
      } else if (res.status === 429) {
        // Rate limited — back off and retry once
        await sleep(10_000);
        const retry = await fetch(putUrl, { method: "PUT", headers });
        if (retry.status === 201 || retry.status === 200 || retry.status === 422) {
          added.push(vinylIds[i]);
        }
      }
      // Other failures (4xx, 5xx) are silently skipped so one bad release
      // doesn't abort the rest of the batch.
    } catch {
      /* skip this release */
    }
  }

  return NextResponse.json({
    masterId,
    vinylVersions: vinylIds.length,
    added: added.length,
    releaseIds: added,
  });
}
