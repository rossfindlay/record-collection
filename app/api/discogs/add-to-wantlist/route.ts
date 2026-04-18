import { NextResponse } from "next/server";

const UA = "RecordCollectionApp/1.0";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

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
      const data = (await apiRes.json()) as {
        results?: Array<{ id: number; type: string }>;
      };
      const id = data.results?.find((r) => r.type === "master")?.id;
      if (id) return id;
    }
  } catch {
    /* fall through */
  }

  await sleep(600);
  const fbUrl = new URL("https://api.discogs.com/database/search");
  fbUrl.searchParams.set("q", `${artist} ${title}`);
  fbUrl.searchParams.set("type", "master");
  fbUrl.searchParams.set("per_page", "5");

  try {
    const apiRes = await fetch(fbUrl.toString(), { headers });
    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        results?: Array<{ id: number }>;
      };
      return data.results?.[0]?.id ?? null;
    }
  } catch {
    /* continue */
  }

  return null;
}

async function fetchVinylIds(
  masterId: number,
  headers: Record<string, string>
): Promise<number[]> {
  const ids: number[] = [];

  for (let page = 1; page <= 2; page++) {
    if (page > 1) await sleep(600);

    const url = new URL(
      `https://api.discogs.com/masters/${masterId}/versions`
    );
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
  const ADD_DELAY_MS = 500;

  for (let i = 0; i < releaseIds.length; i++) {
    if (i > 0) await sleep(ADD_DELAY_MS);

    const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants/${releaseIds[i]}`;
    try {
      const apiRes = await fetch(url, { method: "PUT", headers });

      if (
        apiRes.status === 201 ||
        apiRes.status === 200 ||
        apiRes.status === 422
      ) {
        added.push(releaseIds[i]);
      } else if (apiRes.status === 429) {
        await sleep(10_000);
        const retry = await fetch(url, { method: "PUT", headers });
        if (
          retry.status === 201 ||
          retry.status === 200 ||
          retry.status === 422
        ) {
          added.push(releaseIds[i]);
        }
      }
    } catch {
      /* skip */
    }
  }

  return added;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { username, token } = body as { username?: string; token?: string };

  if (!username || !token) {
    return NextResponse.json(
      { error: "username and token are required" },
      { status: 400 }
    );
  }

  const headers = discogsHeaders(token);

  if (Array.isArray(body.releaseIds) && body.releaseIds.length > 0) {
    const ids = body.releaseIds as number[];
    const added = await addToWantlist(ids, username, headers);
    return NextResponse.json({
      vinylVersions: ids.length,
      added: added.length,
      releaseIds: added,
    });
  }

  const { artist, title, preview } = body as {
    artist?: string;
    title?: string;
    preview?: boolean;
  };

  if (!artist || !title) {
    return NextResponse.json(
      {
        error:
          "artist and title are required when releaseIds are not provided",
      },
      { status: 400 }
    );
  }

  const masterId = await findMasterId(artist, title, headers);
  if (!masterId) {
    return NextResponse.json(
      {
        error: `Could not find "${title}" by "${artist}" on Discogs. Try searching manually at discogs.com.`,
      },
      { status: 404 }
    );
  }

  const vinylIds = await fetchVinylIds(masterId, headers);
  if (vinylIds.length === 0) {
    return NextResponse.json(
      {
        error: `No vinyl versions found for "${title}" on Discogs. The album may only exist on CD or digital.`,
      },
      { status: 404 }
    );
  }

  if (preview) {
    return NextResponse.json({
      masterId,
      vinylVersions: vinylIds.length,
      releaseIds: vinylIds,
    });
  }

  const added = await addToWantlist(vinylIds, username, headers);
  return NextResponse.json({
    masterId,
    vinylVersions: vinylIds.length,
    added: added.length,
    releaseIds: added,
  });
}
