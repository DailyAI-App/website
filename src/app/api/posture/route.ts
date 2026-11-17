import { auth } from "@clerk/nextjs/server";
import { and, eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { postureSamples } from "@/db/schema";
import { resolveUserIdFromApiKey } from "@/lib/api-keys";

const ABNORMAL_THRESHOLD = 5; // score below this counts as "거북목" (0 = slumped, 10 = upright)

// the browser dashboard authenticates with a Clerk session; companion apps
// (iOS/macOS) that can't hold a session send a personal API key instead.
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return resolveUserIdFromApiKey(authHeader.slice("Bearer ".length).trim());
  }
  const { userId } = await auth();
  return userId;
}

function summarize(samples: { score: number }[]) {
  const abnormalCount = samples.filter((s) => s.score < ABNORMAL_THRESHOLD).length;
  const average = samples.length > 0 ? samples.reduce((sum, s) => sum + s.score, 0) / samples.length : null;
  return { count: samples.length, abnormalCount, average };
}

async function todaysSamples(userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return getDb()
    .select()
    .from(postureSamples)
    .where(and(eq(postureSamples.userId, userId), gte(postureSamples.capturedAt, todayStart)))
    .orderBy(postureSamples.capturedAt);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const samples = await todaysSamples(userId);
  return NextResponse.json({
    samples: samples.map((s) => ({ score: s.score, source: s.source, capturedAt: s.capturedAt.getTime() })),
    ...summarize(samples),
  });
}

type RawSample = { score?: unknown; recordedAt?: unknown; capturedAt?: unknown };

function parseScore(entry: unknown): number | null {
  const score = (entry as RawSample)?.score;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10 ? score : null;
}

function parseTimestamp(entry: unknown): Date {
  const raw = (entry as RawSample)?.recordedAt ?? (entry as RawSample)?.capturedAt;
  const parsed = typeof raw === "string" || typeof raw === "number" ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "인증이 필요해요 (로그인 또는 API 키)." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 형식의 요청만 받을 수 있어요." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "요청 본문은 JSON 객체여야 해요." }, { status: 400 });
  }

  const payload = body as { score?: unknown; source?: unknown; samples?: unknown };
  const source =
    typeof payload.source === "string" && payload.source.trim() ? payload.source.trim().slice(0, 40) : "manual";
  const entries = Array.isArray(payload.samples) ? payload.samples : [{ score: payload.score }];

  if (entries.length === 0 || entries.length > 60) {
    return NextResponse.json({ error: "한 번에 최대 60개까지 보낼 수 있어요." }, { status: 400 });
  }

  const rows = entries.map((entry) => ({ score: parseScore(entry), capturedAt: parseTimestamp(entry) }));
  if (rows.some((r) => r.score === null)) {
    return NextResponse.json({ error: "score는 0~10 사이의 숫자여야 해요." }, { status: 400 });
  }

  await getDb()
    .insert(postureSamples)
    .values(rows.map((r) => ({ userId, score: r.score as number, source, capturedAt: r.capturedAt })));

  const samples = await todaysSamples(userId);
  return NextResponse.json({ success: true, recorded: rows.length, ...summarize(samples) });
}
