import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId, encrypt, decrypt } from "@/lib/auth";

/**
 * GET /api/user/spotify — Return cached Spotify data & tokens.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cached = await prisma.spotifyCache.findUnique({ where: { userId } });
    if (!cached) {
      return NextResponse.json({
        tokens: null,
        clientId: null,
        topTracks: [],
        topAlbums: [],
        playlists: [],
      });
    }

    // Decrypt tokens before sending to client
    let tokens = null;
    if (cached.accessToken && cached.refreshToken && cached.expiresAt !== null) {
      tokens = {
        accessToken: decrypt(cached.accessToken),
        refreshToken: decrypt(cached.refreshToken),
        expiresAt: Number(cached.expiresAt),
      };
    }

    // Get the user's stored clientId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { spotifyClientId: true },
    });

    return NextResponse.json({
      tokens,
      clientId: user?.spotifyClientId ?? null,
      topTracks: cached.topTracks ?? [],
      topAlbums: cached.topAlbums ?? [],
      playlists: cached.playlists ?? [],
    });
  } catch (e) {
    console.error("GET /api/user/spotify error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/user/spotify — Save Spotify tokens and/or cached data.
 * Body: { tokens?, clientId?, topTracks?, topAlbums?, playlists? }
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();

    // Build the update data
    const data: Record<string, unknown> = { fetchedAt: new Date() };

    if (body.tokens) {
      data.accessToken = encrypt(body.tokens.accessToken);
      data.refreshToken = encrypt(body.tokens.refreshToken);
      data.expiresAt = BigInt(body.tokens.expiresAt);
    }

    if (body.topTracks !== undefined) data.topTracks = body.topTracks;
    if (body.topAlbums !== undefined) data.topAlbums = body.topAlbums;
    if (body.playlists !== undefined) data.playlists = body.playlists;

    await prisma.spotifyCache.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    // Store clientId on the user record
    if (body.clientId !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: { spotifyClientId: body.clientId },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/user/spotify error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/spotify — Clear all Spotify data for current user.
 */
export async function DELETE() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await prisma.spotifyCache.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { spotifyClientId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/user/spotify error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
