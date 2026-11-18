import { resolveUserId } from "@/lib/auth";
import { and, desc, eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { postureSamples, studyGoals, studySessions, trainerAttempts } from "@/db/schema";

function dateDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function getStudyData(userId: string) {
  const db = getDb();
  const [goals, sessions, mistakes, posture] = await Promise.all([
    db.select().from(studyGoals).where(eq(studyGoals.userId, userId)).orderBy(desc(studyGoals.createdAt)),
    db.select().from(studySessions).where(and(eq(studySessions.userId, userId), gte(studySessions.createdAt, dateDaysAgo(7)))).orderBy(desc(studySessions.createdAt)),
    db.select().from(trainerAttempts).where(and(eq(trainerAttempts.userId, userId), gte(trainerAttempts.createdAt, dateDaysAgo(30)))).orderBy(desc(trainerAttempts.createdAt)).limit(20),
    db.select().from(postureSamples).where(and(eq(postureSamples.userId, userId), gte(postureSamples.capturedAt, dateDaysAgo(7)))).orderBy(desc(postureSamples.capturedAt)).limit(100),
  ]);

  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const averagePosture = posture.length > 0
    ? Math.round((posture.reduce((sum, sample) => sum + sample.score, 0) / posture.length) * 10) / 10
    : null;
  const wrongTypes = mistakes.reduce<Record<string, number>>((counts, attempt) => {
    counts[attempt.type] = (counts[attempt.type] ?? 0) + 1;
    return counts;
  }, {});

  return {
    goal: goals[0] ?? null,
    sessions,
    mistakes,
    analytics: {
      totalMinutes,
      sessionCount: sessions.length,
      averagePosture,
      mistakeCount: mistakes.length,
      wrongTypes,
    },
  };
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  return NextResponse.json(await getStudyData(userId));
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const action = body?.action;
  const db = getDb();

  if (action === "goal") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const examDate = typeof body.examDate === "string" && body.examDate ? body.examDate : null;
    const weeklyMinutes = Number(body.weeklyMinutes);
    const weeklyQuestions = Number(body.weeklyQuestions);
    if (!title || !Number.isInteger(weeklyMinutes) || weeklyMinutes < 30 || !Number.isInteger(weeklyQuestions) || weeklyQuestions < 5) {
      return NextResponse.json({ error: "학습 목표와 주간 학습량을 확인해주세요." }, { status: 400 });
    }

    await db.insert(studyGoals).values({ userId, title, examDate, weeklyMinutes, weeklyQuestions });
    return NextResponse.json(await getStudyData(userId));
  }

  if (action === "session") {
    const minutes = Number(body.minutes);
    const postureScore = body.postureScore === null || body.postureScore === undefined ? null : Number(body.postureScore);
    const focusState = typeof body.focusState === "string" ? body.focusState : "focused";
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240 || (postureScore !== null && (!Number.isFinite(postureScore) || postureScore < 0 || postureScore > 10))) {
      return NextResponse.json({ error: "학습 세션 데이터가 올바르지 않아요." }, { status: 400 });
    }

    const goal = (await db.select({ id: studyGoals.id }).from(studyGoals).where(eq(studyGoals.userId, userId)).orderBy(desc(studyGoals.createdAt)).limit(1))[0];
    await db.insert(studySessions).values({ userId, goalId: goal?.id ?? null, minutes, focusState, postureScore });
    return NextResponse.json(await getStudyData(userId));
  }

  return NextResponse.json({ error: "지원하지 않는 요청이에요." }, { status: 400 });
}
