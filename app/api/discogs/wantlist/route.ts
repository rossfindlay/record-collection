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

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || "Discogs API error" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch from Discogs" }, { status: 500 });
  }
}
