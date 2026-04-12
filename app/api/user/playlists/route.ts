import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/user/playlists — List all playlists for the current user.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ playlists });
  } catch (e) {
    console.error("GET /api/user/playlists error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/user/playlists — Create a new playlist.
 * Body: { name: string, releaseIds?: number[] }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { name, releaseIds } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: name.trim(),
        releaseIds: releaseIds ?? [],
      },
    });

    return NextResponse.json({ playlist }, { status: 201 });
  } catch (e) {
    console.error("POST /api/user/playlists error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/user/playlists — Update a playlist.
 * Body: { id: string, name?: string, releaseIds?: number[] }
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id, name, releaseIds } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.playlist.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(releaseIds !== undefined && { releaseIds }),
      },
    });

    return NextResponse.json({ playlist: updated });
  } catch (e) {
    console.error("PUT /api/user/playlists error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/user/playlists — Delete a playlist.
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.playlist.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    await prisma.playlist.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/user/playlists error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
