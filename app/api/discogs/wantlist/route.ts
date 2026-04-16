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

  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?page=${page}&per_page=${perPage}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${token}`,
        "User-Agent": UA,
      },
    });

    let data: unknown;
    try {
      data = await apiRes.json();
    } catch {
      return NextResponse.json(
        {
          error:
            apiRes.status === 429
              ? "Rate limited by Discogs"
              : "Discogs returned an unexpected response",
        },
        { status: apiRes.status }
      );
    }

    if (!apiRes.ok) {
      const msg =
        (data as { message?: string })?.message ||
        (apiRes.status === 429
          ? "Rate limited by Discogs"
          : "Discogs API error");
      return NextResponse.json({ error: msg }, { status: apiRes.status });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Discogs" },
      { status: 500 }
    );
  }
}
