import { type NextRequest, NextResponse } from "next/server";

const UA = "RecordCollectionApp/1.0";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const username = searchParams.get("username");
  const token = searchParams.get("token");
  const page = searchParams.get("page") ?? "1";
  const perPage = searchParams.get("per_page") ?? "100";

  if (!username || !token) {
    return NextResponse.json(
      { error: "username and token are required" },
      { status: 400 }
    );
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
      return NextResponse.json(
        { error: (data as { message?: string }).message || "Discogs API error" },
        { status: apiRes.status }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Discogs" },
      { status: 500 }
    );
  }
}
