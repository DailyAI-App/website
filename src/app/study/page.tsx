"use client";

import { useEffect, useMemo, useState } from "react";

type Goal = { title: string; examDate: string | null; weeklyMinutes: number; weeklyQuestions: number };
type Mistake = { id: string; type: string; prompt: string; correctAnswer: string; explanation: string };
type StudyData = {
  goal: Goal | null;
  mistakes: Mistake[];
  analytics: { totalMinutes: number; sessionCount: number; averagePosture: number | null; mistakeCount: number; wrongTypes: Record<string, number> };
};

const TYPE_LABELS: Record<string, string> = { ox: "OX", mcq: "객관식", fill_blank: "빈칸" };

async function fetchStudy(init?: RequestInit): Promise<StudyData> {
  const res = await fetch("/api/study", init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "학습 데이터를 불러오지 못했어요.");
  return data;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86_400_000));
}

export default function StudyPage() {
  const [data, setData] = useState<StudyData | null>(null);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState("300");
  const [weeklyQuestions, setWeeklyQuestions] = useState("30");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudy().then(setData).catch((err) => setError(err instanceof Error ? err.message : "학습 데이터를 불러오지 못했어요."));
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const recommendation = useMemo(() => {
    if (!data) return "학습 데이터를 모으는 중이에요.";
    const types = Object.entries(data.analytics.wrongTypes).sort((a, b) => b[1] - a[1]);
    if (types[0]) return `${TYPE_LABELS[types[0][0]] ?? types[0][0]} 유형에서 ${types[0][1]}번 틀렸어요. 오늘은 이 유형의 복습 문제부터 시작해보세요.`;
    if (data.analytics.totalMinutes === 0) return "오늘 25분 집중 세션을 시작해 첫 학습 기록을 만들어보세요.";
    return "새 개념을 읽은 뒤 문제 5개로 바로 회상해보세요.";
  }, [data]);

  async function saveGoal() {
    if (!title.trim()) return;
    setError(null);
    try {
      const next = await fetchStudy({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "goal", title, examDate: examDate || null, weeklyMinutes: Number(weeklyMinutes), weeklyQuestions: Number(weeklyQuestions) }),
      });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목표를 저장하지 못했어요.");
    }
  }

  async function finishSession() {
    setRunning(false);
    const minutes = Math.max(1, Math.round(seconds / 60));
    try {
      const next = await fetchStudy({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "session", minutes, focusState: seconds >= 20 * 60 ? "steady" : "short", postureScore: null }),
      });
      setData(next);
      setSeconds(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "학습 세션을 저장하지 못했어요.");
    }
  }

  const examDays = daysUntil(data?.goal?.examDate ?? null);
  const minutesTarget = data?.goal?.weeklyMinutes ?? 300;
  const minutesProgress = Math.min(100, Math.round(((data?.analytics.totalMinutes ?? 0) / minutesTarget) * 100));

  return (
    <div className="page-shell study-page">
      <div className="study-hero">
        <div>
          <p className="eyebrow">Daily AI Study Loop</p>
          <h2>공부 방법까지 함께 설계하는 학습 코치</h2>
          <p>강의 자료, 오답, 일정, 집중 리듬을 연결해 다음 학습 행동을 추천합니다.</p>
        </div>
        <div className="study-hero-stat">
          <strong>{data?.analytics.totalMinutes ?? 0}</strong>
          <span>이번 주 학습 분</span>
        </div>
      </div>

      {error && <p className="assistant-error">{error}</p>}

      {!data?.goal ? (
        <section className="card study-goal-card">
          <div>
            <p className="eyebrow">첫 단계</p>
            <h3>이번 학습 목표를 정해보세요</h3>
            <p>시험일과 주간 목표를 기준으로 오늘의 학습량을 계산합니다.</p>
          </div>
          <div className="study-goal-form">
            <input className="input" placeholder="예: 운영체제 중간고사" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="study-field"><span>시험일</span><input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></label>
            <label className="study-field"><span>주간 학습 시간(분)</span><input className="input" type="number" min="30" value={weeklyMinutes} onChange={(e) => setWeeklyMinutes(e.target.value)} /></label>
            <label className="study-field"><span>주간 문제 수</span><input className="input" type="number" min="5" value={weeklyQuestions} onChange={(e) => setWeeklyQuestions(e.target.value)} /></label>
            <button type="button" className="btn-primary" onClick={() => void saveGoal()} disabled={!title.trim()}>학습 플랜 만들기</button>
          </div>
        </section>
      ) : (
        <>
          <section className="study-summary-grid">
            <div className="card study-summary-card"><span>학습 목표</span><strong>{data.goal.title}</strong><p>{examDays === null ? "시험일을 정하지 않았어요." : `시험까지 ${examDays}일`}</p></div>
            <div className="card study-summary-card"><span>주간 진행률</span><strong>{minutesProgress}%</strong><div className="study-progress-track"><div className="study-progress-value" style={{ width: `${minutesProgress}%` }} /></div><p>{data.analytics.totalMinutes} / {minutesTarget}분</p></div>
            <div className="card study-summary-card"><span>복습 필요</span><strong>{data.analytics.mistakeCount}개</strong><p>오답노트 기반 맞춤 복습</p></div>
            <div className="card study-summary-card"><span>자세 평균</span><strong>{data.analytics.averagePosture === null ? "—" : `${data.analytics.averagePosture}/10`}</strong><p>AirPods 앱 기록 기준</p></div>
          </section>

          <section className="study-main-grid">
            <div className="card study-focus-card">
              <div className="section-heading"><div><p className="eyebrow">Focus session</p><h3>오늘의 집중 세션</h3></div><span className="status-dot">{running ? "집중 중" : "준비됨"}</span></div>
              <div className="study-timer">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div>
              <p className="study-focus-copy">{running ? "지금은 한 가지 학습에만 집중해보세요. 25분 뒤 휴식을 권장합니다." : recommendation}</p>
              <div className="study-focus-actions">
                {!running ? <button type="button" className="btn-primary" onClick={() => setRunning(true)}>집중 시작</button> : <button type="button" className="btn-primary" onClick={() => void finishSession()}>세션 저장</button>}
                {running && <button type="button" className="chip" onClick={() => setSeconds(0)}>타이머 초기화</button>}
              </div>
            </div>

            <div className="card study-recommendation-card">
              <p className="eyebrow">Adaptive recommendation</p>
              <h3>오늘의 학습 제안</h3>
              <p>{recommendation}</p>
              <div className="study-next-steps"><span>1</span><p>오답 유형을 5분 복습</p><span>2</span><p>관련 문제 5개 풀이</p><span>3</span><p>틀린 이유를 한 줄 기록</p></div>
            </div>
          </section>

          <section className="card study-review-card">
            <div className="section-heading"><div><p className="eyebrow">Spaced review</p><h3>오늘 복습할 카드</h3></div><span className="badge badge-neutral">{data.mistakes.length}개</span></div>
            {data.mistakes.length === 0 ? <p className="study-empty">오답이 쌓이면 개념 복습 카드가 여기에 만들어집니다.</p> : (
              <div className="study-flashcards">
                {data.mistakes.slice(0, 6).map((mistake) => (
                  <button type="button" key={mistake.id} className="study-flashcard" onClick={() => setRevealedId(revealedId === mistake.id ? null : mistake.id)}>
                    <span>{TYPE_LABELS[mistake.type] ?? mistake.type}</span>
                    <strong>{mistake.prompt}</strong>
                    {revealedId === mistake.id ? <p><b>정답</b>{mistake.correctAnswer}<br /><b>핵심</b>{mistake.explanation}</p> : <small>탭해서 정답과 해설 보기</small>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
