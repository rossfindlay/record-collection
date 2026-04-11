import { NextRequest, NextResponse } from "next/server";

// Proxies GET /me/top/tracks or /me/top/artists from Spotify.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accessToken = searchParams.get("access_token");
  const type = searchParams.get("type") || "tracks"; // "tracks" | "artists"
  const timeRange = searchParams.get("time_range") || "long_term";
  const limit = searchParams.get("limit") || "50";

  if (!accessToken) {
    return NextResponse.json({ error: "access_token is required" }, { status: 400 });
  }

  if (type !== "tracks" && type !== "artists") {
    return NextResponse.json({ error: "type must be tracks or artists" }, { status: 400 });
  }

  const url = `https://api.spotify.com/v1/me/top/${type}?time_range=${timeRange}&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json({ error: "Spotify returned an unexpected response" }, { status: res.status });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: { message?: string } })?.error?.message || "Spotify API error" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch from Spotify" }, { status: 500 });
  }
}
