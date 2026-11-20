import { resolveUserId } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { quizSessions } from "@/db/schema";

// one row per "생성" click — created once up front so every mistake logged
// during that quiz run can be grouped under it in 오답노트.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim().slice(0, 200) : "";
  const questionCount = Number(body?.questionCount);
  if (!sourceName || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const [session] = await getDb()
    .insert(quizSessions)
    .values({ userId, sourceName, questionCount })
    .returning();

  return NextResponse.json(session);
}
