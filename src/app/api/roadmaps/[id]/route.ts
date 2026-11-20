import { resolveUserId } from "@/lib/auth";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { roadmapSteps, roadmaps } from "@/db/schema";

type Topic = { name: string; done: boolean };

// topics were originally saved as plain strings; normalize both that and
// the newer {name, done} shape so individually checking a topic off works
// regardless of when the roadmap was created.
function parseTopics(raw: string | null): Topic[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): Topic | null => {
        if (typeof item === "string") return item.trim() ? { name: item.trim(), done: false } : null;
        if (item && typeof item === "object" && typeof item.name === "string" && item.name.trim()) {
          return { name: item.name.trim(), done: item.done === true };
        }
        return null;
      })
      .filter((t): t is Topic => t !== null);
  } catch {
    return [];
  }
}

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
    role: r.role,
    createdAt: r.createdAt,
    steps: steps.filter((s) => s.roadmapId === r.id).map((s) => ({ id: s.id, title: s.title, detail: s.detail, topics: parseTopics(s.topics), done: s.done })),
  }));
}

// PATCH toggles one step's done state (body { stepId }), or one topic
// within a step (body { stepId, topicIndex }) — tracking specific
// competencies built, independent of the step's own completion.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const stepId: unknown = body?.stepId;
  const topicIndex: unknown = body?.topicIndex;
  if (typeof stepId !== "string") return NextResponse.json({ error: "stepId가 필요해요." }, { status: 400 });

  const db = getDb();
  const [owned] = await db.select().from(roadmaps).where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId)));
  if (!owned) return NextResponse.json({ error: "로드맵을 찾지 못했어요." }, { status: 404 });

  const [step] = await db.select().from(roadmapSteps).where(and(eq(roadmapSteps.id, stepId), eq(roadmapSteps.roadmapId, id)));
  if (!step) return NextResponse.json({ error: "단계를 찾지 못했어요." }, { status: 404 });

  if (typeof topicIndex === "number" && Number.isInteger(topicIndex)) {
    const topics = parseTopics(step.topics);
    if (topicIndex < 0 || topicIndex >= topics.length) {
      return NextResponse.json({ error: "토픽을 찾지 못했어요." }, { status: 404 });
    }
    topics[topicIndex] = { ...topics[topicIndex], done: !topics[topicIndex].done };
    await db.update(roadmapSteps).set({ topics: JSON.stringify(topics) }).where(eq(roadmapSteps.id, stepId));
  } else {
    await db.update(roadmapSteps).set({ done: !step.done }).where(eq(roadmapSteps.id, stepId));
  }

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
