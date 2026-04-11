import { NextRequest, NextResponse } from "next/server";

// Proxies GET /me/playlists or /playlists/{id}/tracks from Spotify.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accessToken = searchParams.get("access_token");
  const playlistId = searchParams.get("playlist_id"); // if provided, fetch tracks
  const limit = searchParams.get("limit") || "50";
  const offset = searchParams.get("offset") || "0";

  if (!accessToken) {
    return NextResponse.json({ error: "access_token is required" }, { status: 400 });
  }

  const url = playlistId
    ? `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(name,artists,album)),next,total,offset,limit`
    : `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;

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
