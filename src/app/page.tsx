"use client";

import { useEffect, useRef, useState } from "react";
import TodayTimeline from "@/components/TodayTimeline";
import { fetchStudy, formatMinutes, saveStudySession, type StudyData } from "@/lib/study";
import { fetchPostureStats } from "@/lib/posture";

const PRESENCE_POLL_MS = 5_000;
const FOCUS_SESSION_KEY = "dailyai.focusSession";
const MIN_SAVED_MINUTES = 1;

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// the timer's source of truth is a wall-clock start time, not an
// accumulated tick count — navigating to another page and back (or a
// throttled background tab) unmounts this component, and a tick counter
// would silently reset to 0 and look "frozen" instead of catching up.
function loadPersistedStart(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FOCUS_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.startedAt === "number" ? parsed.startedAt : null;
  } catch {
    return null;
  }
}

export default function TodayPage() {
  const [data, setData] = useState<StudyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [livePresence, setLivePresence] = useState<number | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const presenceSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    fetchStudy().then(setData).catch((err) => setError(err instanceof Error ? err.message : "학습 데이터를 불러오지 못했어요."));
  }, []);

  // resume a focus session that was already running before navigating away.
  useEffect(() => {
    const startedAt = loadPersistedStart();
    if (startedAt == null) return;
    startedAtRef.current = startedAt;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startedAtRef.current != null) setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // AirPods auto-detection: the web app can't read AirPods motion directly,
  // but once the DailyAI companion app (iPad/Mac) is posting presence
  // samples, polling picks them up and attributes them to this session.
  useEffect(() => {
    if (!running) return;
    async function poll() {
      try {
        const stats = await fetchPostureStats();
        const start = startedAtRef.current ?? Date.now();
        const inWindow = stats.samples.filter((sample) => sample.capturedAt >= start);
        if (inWindow.length === 0) return;
        presenceSamplesRef.current = inWindow.map((sample) => sample.score);
        setLivePresence(inWindow[inWindow.length - 1].score);
      } catch {
        // no AirPods companion app running — the timer still works without it.
      }
    }
    void poll();
    const timer = window.setInterval(poll, PRESENCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  function startSession() {
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    presenceSamplesRef.current = [];
    setLivePresence(null);
    setSeconds(0);
    setRunning(true);
    window.localStorage.setItem(FOCUS_SESSION_KEY, JSON.stringify({ startedAt }));
  }

  function resetTimer() {
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setSeconds(0);
    window.localStorage.setItem(FOCUS_SESSION_KEY, JSON.stringify({ startedAt }));
  }

  async function finishSession() {
    setRunning(false);
    const elapsedSeconds = startedAtRef.current != null ? Math.floor((Date.now() - startedAtRef.current) / 1000) : seconds;
    window.localStorage.removeItem(FOCUS_SESSION_KEY);
    setSeconds(0);

    // a session under 30s rounds to 0 minutes — don't inflate it to a fake
    // "1분" of study, just drop it.
    const minutes = Math.round(elapsedSeconds / 60);
    if (minutes < MIN_SAVED_MINUTES) return;

    const samples = presenceSamplesRef.current;
    const averagePresence = samples.length > 0 ? Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10 : null;
    try {
      const next = await saveStudySession(minutes, elapsedSeconds >= 20 * 60 ? "steady" : "short", averagePresence);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "학습 세션을 저장하지 못했어요.");
    }
  }

  return (
    <div className="page-shell study-page">
      <div className="study-hero">
        <div>
          <p className="eyebrow">Daily AI Study Loop</p>
          <h2>오늘, 집중한 시간을 한눈에.</h2>
          <p>집중 시작을 누르면 AirPods가 자동으로 학습 중인지 감지해서 오늘의 타임로그에 남겨요.</p>
        </div>
        <div className="study-hero-stat">
          <strong>{formatMinutes(data?.analytics.totalMinutes ?? 0)}</strong>
          <span>이번 주 학습</span>
        </div>
        <div className="study-hero-stat">
          <strong>{data?.analytics.currentStreak ? `🔥 ${data.analytics.currentStreak}일` : "0일"}</strong>
          <span>연속 학습 스트릭</span>
        </div>
      </div>

      {error && <p className="assistant-error">{error}</p>}

      <section className="study-main-grid">
        <div className="card study-focus-card">
          <div className="section-heading">
            <div><p className="eyebrow">Focus session</p><h3>오늘의 집중 세션</h3></div>
            <span className="status-dot">{running ? "집중 중" : "준비됨"}</span>
          </div>
          <div className="study-timer">{formatTimer(seconds)}</div>
          <p className="study-focus-copy">
            {running
              ? livePresence != null
                ? `AirPods로 학습 중 감지됨 · ${livePresence.toFixed(1)}/10`
                : "지금은 한 가지 학습에만 집중해보세요. 25분 뒤 휴식을 권장합니다."
              : "타이머를 시작하면 AirPods 착용 여부로 학습 중인지 자동으로 감지해요."}
          </p>
          <div className="study-focus-actions">
            {!running
              ? <button type="button" className="btn-primary" onClick={startSession}>집중 시작</button>
              : <button type="button" className="btn-primary" onClick={() => void finishSession()}>세션 저장</button>}
            {running && <button type="button" className="chip" onClick={resetTimer}>타이머 초기화</button>}
          </div>
        </div>

        <div className="card study-recommendation-card">
          <p className="eyebrow">ACTIVITY</p>
          <h3>오늘의 타임로그</h3>
          <TodayTimeline sessions={data?.sessions ?? []} />
        </div>
      </section>
    </div>
  );
}
