import { resolveUserId } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { trainerAttempts } from "@/db/schema";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;

  await getDb()
    .delete(trainerAttempts)
    .where(and(eq(trainerAttempts.id, id), eq(trainerAttempts.userId, userId)));

  return NextResponse.json({ success: true });
}
