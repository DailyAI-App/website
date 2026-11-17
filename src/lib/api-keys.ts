import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";

function generateKey(): string {
  return `pk_${randomBytes(24).toString("hex")}`;
}

export async function getOrCreateApiKey(userId: string): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
  if (existing) return existing.key;

  const key = generateKey();
  await db.insert(apiKeys).values({ userId, key });
  return key;
}

export async function regenerateApiKey(userId: string): Promise<string> {
  const db = getDb();
  const key = generateKey();
  await db
    .insert(apiKeys)
    .values({ userId, key })
    .onConflictDoUpdate({ target: apiKeys.userId, set: { key } });
  return key;
}

export async function resolveUserIdFromApiKey(key: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.key, key));
  return row?.userId ?? null;
}
