import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/user/collection — Return cached Discogs collection.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cached = await prisma.cachedCollection.findUnique({ where: { userId } });
    if (!cached) {
      return NextResponse.json({ releases: [], fetchedAt: null });
    }

    return NextResponse.json({ releases: cached.releases, fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("GET /api/user/collection error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/user/collection — Save/update cached collection.
 * Body: { releases: DiscogsRelease[] }
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { releases } = await req.json();
    if (!Array.isArray(releases)) {
      return NextResponse.json({ error: "releases must be an array" }, { status: 400 });
    }

    const cached = await prisma.cachedCollection.upsert({
      where: { userId },
      update: { releases, fetchedAt: new Date() },
      create: { userId, releases, fetchedAt: new Date() },
    });

    return NextResponse.json({ fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("PUT /api/user/collection error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
