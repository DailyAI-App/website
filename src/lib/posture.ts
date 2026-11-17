export type PostureSample = {
  score: number;
  source: string;
  capturedAt: number;
};

export type PostureStats = {
  samples: PostureSample[];
  count: number;
  abnormalCount: number;
  average: number | null;
};

export function scoreLabel(score: number | null): string {
  if (score == null) return "아직 측정 전";
  if (score >= 8) return "아주 좋아요";
  if (score >= 6) return "조금만 더 곧게";
  return "자세를 바로잡아 주세요";
}

export function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function fetchPostureStats(): Promise<PostureStats> {
  const response = await fetch("/api/posture", { cache: "no-store" });
  const data = (await response.json()) as PostureStats & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "기록을 불러오지 못했어요.");
  return data;
}

export async function savePostureSample(score: number, source: string): Promise<void> {
  const response = await fetch("/api/posture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ score, source }),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "기록하지 못했어요.");
}
