import { resolveUserId } from "@/lib/auth";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
    steps: steps.filter((s) => s.roadmapId === r.id).map((s) => ({ id: s.id, title: s.title, detail: s.detail, done: s.done })),
  }));
}

// PATCH toggles one step's done state: body { stepId }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const stepId: unknown = body?.stepId;
  if (typeof stepId !== "string") return NextResponse.json({ error: "stepId가 필요해요." }, { status: 400 });

  const db = getDb();
  const [owned] = await db.select().from(roadmaps).where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId)));
  if (!owned) return NextResponse.json({ error: "로드맵을 찾지 못했어요." }, { status: 404 });

  const [step] = await db.select().from(roadmapSteps).where(and(eq(roadmapSteps.id, stepId), eq(roadmapSteps.roadmapId, id)));
  if (!step) return NextResponse.json({ error: "단계를 찾지 못했어요." }, { status: 404 });

  await db.update(roadmapSteps).set({ done: !step.done }).where(eq(roadmapSteps.id, stepId));

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  await getDb()
    .delete(roadmaps)
    .where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId)));

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}
