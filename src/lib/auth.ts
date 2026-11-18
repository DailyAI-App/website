import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { resolveUserIdFromApiKey } from "@/lib/api-keys";

// the web dashboard authenticates with a Clerk session; native companion
// apps (iOS/iPadOS/macOS) that can't hold a browser session send a personal
// API key instead (issued from /posture, works for every endpoint).
export async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return resolveUserIdFromApiKey(authHeader.slice("Bearer ".length).trim());
  }
  const { userId } = await auth();
  return userId;
}
