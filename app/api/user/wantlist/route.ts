import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/user/wantlist — Return cached wantlist.
 */
export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cached = await prisma.cachedWantlist.findUnique({ where: { userId } });
    if (!cached) {
      return NextResponse.json({ items: [], fetchedAt: null });
    }

    return NextResponse.json({ items: cached.items, fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("GET /api/user/wantlist error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/user/wantlist — Save/update cached wantlist.
 * Body: { items: SlimWantlistItem[] }
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { items } = await req.json();
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }

    const cached = await prisma.cachedWantlist.upsert({
      where: { userId },
      update: { items, fetchedAt: new Date() },
      create: { userId, items, fetchedAt: new Date() },
    });

    return NextResponse.json({ fetchedAt: cached.fetchedAt });
  } catch (e) {
    console.error("PUT /api/user/wantlist error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
