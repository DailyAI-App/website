import { auth } from "@clerk/nextjs/server";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { calendarEvents } from "@/db/schema";

async function listEvents(userId: string) {
  return getDb()
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId))
    .orderBy(asc(calendarEvents.date));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  return NextResponse.json({ events: await listEvents(userId) });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const title: unknown = body?.title;
  const date: unknown = body?.date;
  const detail: unknown = body?.detail;

  if (typeof title !== "string" || !title.trim() || typeof date !== "string" || !date.trim()) {
    return NextResponse.json({ error: "title과 date는 필수예요." }, { status: 400 });
  }

  await getDb()
    .insert(calendarEvents)
    .values({ userId, title: title.trim(), date, detail: typeof detail === "string" ? detail : null });

  return NextResponse.json({ events: await listEvents(userId) });
}
