import { resolveUserId } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { trainerAttempts } from "@/db/schema";

const GRADABLE_TYPES = ["ox", "mcq", "fill_blank"];

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const attempts = await getDb()
    .select()
    .from(trainerAttempts)
    .where(eq(trainerAttempts.userId, userId))
    .orderBy(desc(trainerAttempts.createdAt));

  return NextResponse.json({ attempts });
}

// only called when the user got a gradable question (ox/mcq/fill_blank) wrong —
// this is a mistake log, not a full attempt history.
export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const { type, prompt, options, correctAnswer, userAnswer, explanation } = body ?? {};

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
    type,
    prompt,
    options: Array.isArray(options) ? JSON.stringify(options) : null,
    correctAnswer,
    userAnswer,
    explanation,
  });

  return NextResponse.json({ success: true });
}
