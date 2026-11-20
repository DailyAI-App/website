// shared types + fetch helpers for /api/study, used by both the "오늘"
// focus-timer dashboard and the "학습 코치" quiz page.

export type Goal = { title: string; examDate: string | null; weeklyMinutes: number; weeklyQuestions: number };
export type Mistake = { id: string; type: string; prompt: string; correctAnswer: string; explanation: string };
export type StudySession = { id: string; minutes: number; focusState: string; postureScore: number | null; createdAt: string };
export type StudyAnalytics = {
  totalMinutes: number;
  sessionCount: number;
  averagePosture: number | null;
  mistakeCount: number;
  wrongTypes: Record<string, number>;
  currentStreak: number;
  longestStreak: number;
};
export type StudyData = {
  goal: Goal | null;
  sessions: StudySession[];
  mistakes: Mistake[];
  analytics: StudyAnalytics;
};

export const TYPE_LABELS: Record<string, string> = { ox: "OX", mcq: "객관식", fill_blank: "빈칸", descriptive: "오류 찾기" };

export async function fetchStudy(init?: RequestInit): Promise<StudyData> {
  const res = await fetch("/api/study", init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "학습 데이터를 불러오지 못했어요.");
  return data;
}

export async function saveStudySession(minutes: number, focusState: string, postureScore: number | null): Promise<StudyData> {
  return fetchStudy({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "session", minutes, focusState, postureScore }),
  });
}

export function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}
