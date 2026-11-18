import { resolveUserId } from "@/lib/auth";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { roadmapSteps, roadmaps } from "@/db/schema";

async function listRoadmaps(userId: string) {
  const db = getDb();
  const rows = await db.select().from(roadmaps).where(eq(roadmaps.userId, userId)).orderBy(desc(roadmaps.createdAt));
  if (rows.length === 0) return [];

  const steps = await db
    .select()
    .from(roadmapSteps)
    .where(inArray(roadmapSteps.roadmapId, rows.map((r) => r.id)))
    .orderBy(asc(roadmapSteps.position));

  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    createdAt: r.createdAt,
    steps: steps.filter((s) => s.roadmapId === r.id).map((s) => ({ id: s.id, title: s.title, done: s.done })),
  }));
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const company: unknown = body?.company;
  const steps: unknown = body?.steps;
  if (typeof company !== "string" || !company.trim() || !Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "company와 steps가 필요해요." }, { status: 400 });
  }
  const stepTitles = steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  if (stepTitles.length === 0) {
    return NextResponse.json({ error: "steps에 유효한 항목이 없어요." }, { status: 400 });
  }

  const db = getDb();
  const [roadmap] = await db.insert(roadmaps).values({ userId, company: company.trim() }).returning();
  await db.insert(roadmapSteps).values(
    stepTitles.map((title, i) => ({ roadmapId: roadmap.id, title, position: i })),
  );

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}
