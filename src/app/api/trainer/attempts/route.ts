import { resolveUserId } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { quizSessions, trainerAttempts } from "@/db/schema";

const GRADABLE_TYPES = ["ox", "mcq", "fill_blank"];

// groups every mistake under the quiz session ("챕터") it was logged
// during, newest session first; attempts without a session (older rows,
// or a session that's since been deleted) fall under a synthetic bucket.
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const db = getDb();
  const [sessions, attempts] = await Promise.all([
    db.select().from(quizSessions).where(eq(quizSessions.userId, userId)).orderBy(desc(quizSessions.createdAt)),
    db.select().from(trainerAttempts).where(eq(trainerAttempts.userId, userId)).orderBy(desc(trainerAttempts.createdAt)),
  ]);

  const attemptsBySession = new Map<string, typeof attempts>();
  const unassigned: typeof attempts = [];
  for (const attempt of attempts) {
    if (!attempt.sessionId) {
      unassigned.push(attempt);
      continue;
    }
    const bucket = attemptsBySession.get(attempt.sessionId) ?? [];
    bucket.push(attempt);
    attemptsBySession.set(attempt.sessionId, bucket);
  }

  const grouped = sessions.map((session) => ({
    ...session,
    attempts: attemptsBySession.get(session.id) ?? [],
  }));

  if (unassigned.length > 0) {
    grouped.push({
      id: "unassigned",
      userId,
      sourceName: "이전 기록",
      questionCount: unassigned.length,
      createdAt: unassigned[0].createdAt,
      attempts: unassigned,
    });
  }

  return NextResponse.json({ sessions: grouped });
}

// only called when the user got a gradable question (ox/mcq/fill_blank) wrong —
// this is a mistake log, not a full attempt history.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const { type, prompt, options, correctAnswer, userAnswer, explanation, sessionId } = body ?? {};

  if (
    !GRADABLE_TYPES.includes(type) ||
    typeof prompt !== "string" ||
    typeof correctAnswer !== "string" ||
    typeof userAnswer !== "string" ||
    typeof explanation !== "string"
  ) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  await getDb().insert(trainerAttempts).values({
    userId,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    type,
    prompt,
    options: Array.isArray(options) ? JSON.stringify(options) : null,
    correctAnswer,
    userAnswer,
    explanation,
  });

  return NextResponse.json({ success: true });
}
