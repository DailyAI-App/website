import { resolveUserId } from "@/lib/auth";
import { asc, desc, eq, inArray } from "drizzle-orm";
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

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}

type StepInput = { title: string; detail?: string; topics?: string[] };

// accepts the old plain-string steps or the newer {title, detail, topics}
// shape, so older saved clients still work.
function normalizeSteps(raw: unknown): StepInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): StepInput | null => {
      if (typeof item === "string") return item.trim() ? { title: item.trim() } : null;
      if (item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string") {
        const title = (item as { title: string }).title.trim();
        if (!title) return null;
        const detail = (item as { detail?: unknown }).detail;
        const topicsRaw = (item as { topics?: unknown }).topics;
        const topics = Array.isArray(topicsRaw) ? topicsRaw.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : undefined;
        return { title, detail: typeof detail === "string" ? detail.trim() : undefined, topics };
      }
      return null;
    })
    .filter((s): s is StepInput => s !== null);
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const company: unknown = body?.company;
  const role: unknown = body?.role;
  const steps = normalizeSteps(body?.steps);
  if (typeof company !== "string" || !company.trim() || steps.length === 0) {
    return NextResponse.json({ error: "company와 steps가 필요해요." }, { status: 400 });
  }

  const db = getDb();
  const [roadmap] = await db
    .insert(roadmaps)
    .values({ userId, company: company.trim(), role: typeof role === "string" && role.trim() ? role.trim() : null })
    .returning();
  await db.insert(roadmapSteps).values(
    steps.map((step, i) => ({
      roadmapId: roadmap.id,
      title: step.title,
      detail: step.detail || null,
      topics: step.topics && step.topics.length > 0 ? JSON.stringify(step.topics.map((name) => ({ name, done: false }))) : null,
      position: i,
    })),
  );

  return NextResponse.json({ roadmaps: await listRoadmaps(userId) });
}
