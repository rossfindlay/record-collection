import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const token = searchParams.get("token");
  const page = searchParams.get("page") || "1";
  const perPage = searchParams.get("per_page") || "100";

  if (!username || !token) {
    return NextResponse.json(
      { error: "username and token are required" },
      { status: 400 }
    );
  }

  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?page=${page}&per_page=${perPage}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${token}`,
        "User-Agent": "RecordCollectionApp/1.0",
      },
    });

    // Parse body safely — Discogs can return an HTML error page (e.g. from
    // Cloudflare) when rate-limited or under load, which would cause res.json()
    // to throw and swallow the real status code.
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json(
        { error: res.status === 429 ? "Rate limited by Discogs" : "Discogs returned an unexpected response" },
        { status: res.status }
      );
    }

    if (!res.ok) {
      const msg =
        (data as { message?: string })?.message ||
        (res.status === 429 ? "Rate limited by Discogs" : "Discogs API error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch from Discogs" }, { status: 500 });
  }
}
