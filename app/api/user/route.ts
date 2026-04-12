import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt, setSessionCookie, clearSessionCookie, getSessionUserId } from "@/lib/auth";

/**
 * POST /api/user — Login / register via Discogs credentials.
 * Verifies the token against the Discogs API, then upserts a User row
 * and sets a session cookie.
 *
 * Body: { username: string, token: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { username, token } = await req.json();
    if (!username || !token) {
      return NextResponse.json({ error: "username and token are required" }, { status: 400 });
    }

    // Verify credentials against Discogs
    const verify = await fetch(
      `https://api.discogs.com/users/${encodeURIComponent(username)}`,
      {
        headers: {
          Authorization: `Discogs token=${token}`,
          "User-Agent": "RecordCollectionApp/1.0",
        },
      }
    );
    if (!verify.ok) {
      return NextResponse.json({ error: "Invalid Discogs credentials" }, { status: 401 });
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { discogsUsername: username },
      update: { discogsToken: encrypt(token) },
      create: {
        discogsUsername: username,
        discogsToken: encrypt(token),
      },
    });

    await setSessionCookie(user.id);

    return NextResponse.json({ id: user.id, discogsUsername: user.discogsUsername });
  } catch (e) {
    console.error("POST /api/user error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/user — Return current session user info.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, discogsUsername: true, spotifyClientId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (e) {
    console.error("GET /api/user error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/user — Logout (clear session cookie).
 */
export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
