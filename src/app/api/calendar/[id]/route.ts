import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const updates: Partial<{ title: string; date: string; detail: string | null }> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.date === "string" && body.date.trim()) updates.date = body.date;
  if (typeof body?.detail === "string" || body?.detail === null) updates.detail = body.detail;

  await getDb()
    .update(calendarEvents)
    .set(updates)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));

  return NextResponse.json({ events: await listEvents(userId) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  await getDb()
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));

  return NextResponse.json({ events: await listEvents(userId) });
}
