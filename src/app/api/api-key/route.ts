import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateApiKey, regenerateApiKey } from "@/lib/api-keys";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const key = await getOrCreateApiKey(userId);
  return NextResponse.json({ key });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const key = await regenerateApiKey(userId);
  return NextResponse.json({ key });
}
