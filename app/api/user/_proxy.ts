import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8080";

export async function proxy(request: NextRequest, destPath: string): Promise<NextResponse> {
  const url = `${API_URL}${destPath}`;
  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? await request.text()
        : undefined,
    });

    const body = await upstream.text();
    const res = new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });

    const setCookie = upstream.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      res.headers.append("Set-Cookie", c);
    }

    return res;
  } catch {
    return NextResponse.json(
      { error: "Backend server unreachable" },
      { status: 502 },
    );
  }
}
