"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Goal = { title: string; examDate: string | null; weeklyMinutes: number; weeklyQuestions: number };
type Mistake = { id: string; type: string; prompt: string; correctAnswer: string; explanation: string };
type StudyData = {
  goal: Goal | null;
  mistakes: Mistake[];
  analytics: { totalMinutes: number; sessionCount: number; averagePosture: number | null; mistakeCount: number; wrongTypes: Record<string, number> };
};

type QuestionType = "ox" | "mcq" | "fill_blank" | "descriptive";
type OXQuestion = { type: "ox"; statement: string; isTrue: boolean; explanation: string };
type MCQQuestion = { type: "mcq"; question: string; options: string[]; correctIndex: number; explanation: string };
type FillBlankQuestion = { type: "fill_blank"; sentence: string; answer: string; explanation: string };
type DescriptiveQuestion = { type: "descriptive"; explanation: string; flaw: string; correction: string };
type Question = OXQuestion | MCQQuestion | FillBlankQuestion | DescriptiveQuestion;
type Attempt = { id: string; type: string; prompt: string; correctAnswer: string; userAnswer: string; explanation: string };

const TYPE_LABELS: Record<string, string> = { ox: "OX", mcq: "객관식", fill_blank: "빈칸", descriptive: "오류 찾기" };
const AUTO_MIX: QuestionType[] = ["mcq", "ox", "fill_blank", "descriptive"];
const QUESTION_COUNTS = [5, 10, 20] as const;

async function fetchStudy(init?: RequestInit): Promise<StudyData> {
  const res = await fetch("/api/study", init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "학습 데이터를 불러오지 못했어요.");
  return data;
}

function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86_400_000));
}

export default function StudyPage() {
  const [view, setView] = useState<"home" | "notebook">("home");
  const [data, setData] = useState<StudyData | null>(null);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState("300");
  const [weeklyQuestions, setWeeklyQuestions] = useState("30");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // quiz session
  const [file, setFile] = useState<File | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [typeMode, setTypeMode] = useState<"mix" | QuestionType>("mix");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedOx, setSelectedOx] = useState<boolean | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [blankInput, setBlankInput] = useState("");
  const [graded, setGraded] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");

  const [allMistakes, setAllMistakes] = useState<Attempt[] | null>(null);

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
    if (data.analytics.totalMinutes === 0) return "강의 자료를 올려서 첫 학습 세션을 시작해보세요.";
    return "새 개념을 읽은 뒤 문제 몇 개로 바로 회상해보세요.";
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

  // --- quiz session: upload kicks it off automatically, no type/count picking required ---

  function nextTypeFor(num: number): QuestionType {
    if (typeMode !== "mix") return typeMode;
    return AUTO_MIX[(num - 1) % AUTO_MIX.length];
  }

  function resetAnswerState() {
    setSelectedOx(null);
    setSelectedIndex(null);
    setBlankInput("");
    setGraded(null);
    setRevealed(false);
    setGuess("");
  }

  async function generateQuestion(num: number) {
    if (!file) return;
    setQuizLoading(true);
    setQuizError(null);
    resetAnswerState();
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("type", nextTypeFor(num));
      const res = await fetch("/api/trainer", { method: "POST", body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "문제를 만들지 못했어요.");
      setQuestion(payload);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
    } finally {
      setQuizLoading(false);
    }
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setQuestion(null);
    setQuestionNumber(0);
    setCompletedCount(0);
    setSessionComplete(false);
    setQuizError(null);
    resetAnswerState();
    // the whole point is "upload it and it just starts" — no extra click.
    if (selected) {
      setQuestionNumber(1);
      void generateQuestion(1);
    }
  }

  async function handleNextQuestion() {
    if (questionNumber >= questionCount) {
      setQuestion(null);
      setSessionComplete(true);
      return;
    }
    const next = questionNumber + 1;
    setQuestionNumber(next);
    await generateQuestion(next);
  }

  function markCompleted() {
    setCompletedCount((previous) => previous + 1);
  }

  async function logMistake(args: { type: QuestionType; prompt: string; options?: string[]; correctAnswer: string; userAnswer: string; explanation: string }) {
    try {
      await fetch("/api/trainer/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      setData((prev) => (prev ? { ...prev, analytics: { ...prev.analytics, mistakeCount: prev.analytics.mistakeCount + 1 } } : prev));
    } catch {
      // the quiz experience itself doesn't depend on logging succeeding
    }
  }

  function answerOx(value: boolean) {
    if (!question || question.type !== "ox" || graded !== null) return;
    setSelectedOx(value);
    const isCorrect = value === question.isTrue;
    setGraded(isCorrect);
    markCompleted();
    if (!isCorrect) {
      void logMistake({ type: "ox", prompt: question.statement, correctAnswer: question.isTrue ? "참" : "거짓", userAnswer: value ? "참" : "거짓", explanation: question.explanation });
    }
  }

  function answerMcq(index: number) {
    if (!question || question.type !== "mcq" || graded !== null) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    setGraded(isCorrect);
    markCompleted();
    if (!isCorrect) {
      void logMistake({ type: "mcq", prompt: question.question, options: question.options, correctAnswer: question.options[question.correctIndex], userAnswer: question.options[index], explanation: question.explanation });
    }
  }

  function answerBlank() {
    if (!question || question.type !== "fill_blank" || graded !== null || !blankInput.trim()) return;
    const isCorrect = blankInput.trim().toLowerCase() === question.answer.trim().toLowerCase();
    setGraded(isCorrect);
    markCompleted();
    if (!isCorrect) {
      void logMistake({ type: "fill_blank", prompt: question.sentence, correctAnswer: question.answer, userAnswer: blankInput.trim(), explanation: question.explanation });
    }
  }

  async function openNotebook() {
    setView("notebook");
    try {
      const res = await fetch("/api/trainer/attempts");
      const payload = await res.json();
      if (res.ok) setAllMistakes(payload.attempts);
    } catch {
      setAllMistakes([]);
    }
  }

  async function deleteAttempt(id: string) {
    setAllMistakes((prev) => prev?.filter((a) => a.id !== id) ?? null);
    await fetch(`/api/trainer/attempts/${id}`, { method: "DELETE" });
  }

  const examDays = daysUntil(data?.goal?.examDate ?? null);
  const minutesTarget = data?.goal?.weeklyMinutes ?? 300;
  const minutesProgress = Math.min(100, Math.round(((data?.analytics.totalMinutes ?? 0) / minutesTarget) * 100));

  if (view === "notebook") {
    return (
      <div className="page-shell">
        <button type="button" className="link-back" onClick={() => setView("home")}>‹ 학습 코치로 돌아가기</button>
        <div className="section-heading"><div><p className="eyebrow">오답노트</p><h2 className="trainer-notebook-title">틀린 문제 모아보기</h2></div></div>
        {allMistakes === null && <p className="chat-empty-text">불러오는 중…</p>}
        {allMistakes?.length === 0 && <p className="chat-empty-text">아직 틀린 문제가 없어요.</p>}
        <div className="trainer-notebook-list">
          {allMistakes?.map((a) => (
            <div key={a.id} className="card trainer-notebook-item">
              <div className="trainer-notebook-item-head">
                <span className="badge badge-neutral">{TYPE_LABELS[a.type] ?? a.type}</span>
                <button type="button" className="btn-text-danger" onClick={() => void deleteAttempt(a.id)}>삭제</button>
              </div>
              <p className="trainer-notebook-prompt">{a.prompt}</p>
              <p className="trainer-notebook-answer"><strong>내 답</strong>{a.userAnswer}</p>
              <p className="trainer-notebook-answer trainer-notebook-answer-correct"><strong>정답</strong>{a.correctAnswer}</p>
              <p className="trainer-notebook-explanation">{a.explanation}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell study-page">
      <div className="study-hero">
        <div>
          <p className="eyebrow">Daily AI Study Loop</p>
          <h2>공부 방법까지 함께 설계하는 학습 코치</h2>
          <p>강의 자료, 오답, 일정, 집중 리듬을 연결해 다음 학습 행동을 추천합니다.</p>
        </div>
        <div className="study-hero-stat">
          <strong>{formatMinutes(data?.analytics.totalMinutes ?? 0)}</strong>
          <span>이번 주 학습</span>
        </div>
      </div>

      {error && <p className="assistant-error">{error}</p>}

      {/* quiz session — upload a file and it just starts. no type/count decision required. */}
      <section className="card study-upload-card">
        <div className="section-heading">
          <div><p className="eyebrow">강의 자료 업로드</p><h3>PDF나 PPT를 올리면 바로 학습이 시작돼요</h3></div>
          <button type="button" className="chip" onClick={() => void openNotebook()}>오답노트</button>
        </div>

        {!question && !sessionComplete && (
          <div className="study-upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="btn-primary study-upload-button" onClick={() => fileInputRef.current?.click()} disabled={quizLoading}>
              {quizLoading ? "문제를 만드는 중…" : file ? file.name : "강의 자료 선택하고 바로 시작"}
            </button>
            <button type="button" className="chip" onClick={() => setShowSettings((v) => !v)}>설정</button>
          </div>
        )}
        {quizError && <p className="assistant-error">{quizError}</p>}

        {showSettings && !question && (
          <div className="study-settings">
            <div className="control-group">
              <span className="study-settings-label">문제 유형</span>
              {(["mix", ...AUTO_MIX] as const).map((t) => (
                <button key={t} type="button" className={typeMode === t ? "chip chip-active" : "chip"} onClick={() => setTypeMode(t)}>
                  {t === "mix" ? "자동 섞기" : TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="control-group">
              <span className="study-settings-label">문제 수</span>
              {QUESTION_COUNTS.map((count) => (
                <button key={count} type="button" className={questionCount === count ? "chip chip-active" : "chip"} onClick={() => setQuestionCount(count)}>
                  {count}개
                </button>
              ))}
            </div>
          </div>
        )}

        {questionNumber > 0 && !sessionComplete && (
          <div className="trainer-progress">
            <div className="trainer-progress-head">
              <span>학습 세션</span>
              <strong>{questionNumber} / {questionCount} 문제</strong>
            </div>
            <div className="trainer-progress-track">
              <div className="trainer-progress-value" style={{ width: `${(completedCount / questionCount) * 100}%` }} />
            </div>
          </div>
        )}

        {sessionComplete && (
          <div className="trainer-complete">
            <p className="eyebrow">학습 세션 완료</p>
            <h3>{questionCount}문제를 모두 풀었어요.</h3>
            <p>오답은 오답노트에 저장돼 있어요.</p>
            <div className="trainer-control-actions">
              <button type="button" className="btn-primary" onClick={() => { setQuestionNumber(1); void generateQuestion(1); }}>
                같은 자료로 다시 시작
              </button>
              <button type="button" className="chip" onClick={() => void openNotebook()}>오답노트 보기</button>
            </div>
          </div>
        )}

        {question?.type === "ox" && (
          <div className="trainer-card">
            <p className="eyebrow">참일까요, 거짓일까요?</p>
            <p className="trainer-explanation">{question.statement}</p>
            <div className="trainer-ox-row">
              <button type="button" className={selectedOx === true ? "btn-primary" : "chip"} onClick={() => answerOx(true)} disabled={graded !== null}>참</button>
              <button type="button" className={selectedOx === false ? "btn-primary" : "chip"} onClick={() => answerOx(false)} disabled={graded !== null}>거짓</button>
            </div>
            {graded !== null && (
              <div className={graded ? "trainer-reveal trainer-reveal-correct" : "trainer-reveal trainer-reveal-wrong"}>
                <p><strong>{graded ? "정답이에요" : "틀렸어요"}</strong>{question.explanation}</p>
                <button type="button" className="btn-primary trainer-next-button" onClick={() => void handleNextQuestion()}>
                  {questionNumber === questionCount ? "학습 완료" : "다음 문제"}
                </button>
              </div>
            )}
          </div>
        )}

        {question?.type === "mcq" && (
          <div className="trainer-card">
            <p className="eyebrow">맞는 보기를 골라보세요</p>
            <p className="trainer-explanation">{question.question}</p>
            <div className="trainer-mcq-list">
              {question.options.map((option, i) => {
                const classes = ["chip", "trainer-mcq-option"];
                if (selectedIndex === i) classes.push(graded ? "trainer-mcq-correct" : "trainer-mcq-wrong");
                else if (graded !== null && i === question.correctIndex) classes.push("trainer-mcq-correct");
                return (
                  <button key={i} type="button" className={classes.join(" ")} onClick={() => answerMcq(i)} disabled={graded !== null}>
                    {option}
                  </button>
                );
              })}
            </div>
            {graded !== null && (
              <div className={graded ? "trainer-reveal trainer-reveal-correct" : "trainer-reveal trainer-reveal-wrong"}>
                <p><strong>{graded ? "정답이에요" : "틀렸어요"}</strong>{question.explanation}</p>
                <button type="button" className="btn-primary trainer-next-button" onClick={() => void handleNextQuestion()}>
                  {questionNumber === questionCount ? "학습 완료" : "다음 문제"}
                </button>
              </div>
            )}
          </div>
        )}

        {question?.type === "fill_blank" && (
          <div className="trainer-card">
            <p className="eyebrow">빈칸에 들어갈 말은?</p>
            <p className="trainer-explanation">{question.sentence}</p>
            <div className="trainer-ox-row">
              <input className="input" placeholder="정답 입력" value={blankInput} onChange={(e) => setBlankInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answerBlank()} disabled={graded !== null} />
              <button type="button" className="btn-primary" onClick={answerBlank} disabled={graded !== null || !blankInput.trim()}>제출</button>
            </div>
            {graded !== null && (
              <div className={graded ? "trainer-reveal trainer-reveal-correct" : "trainer-reveal trainer-reveal-wrong"}>
                <p><strong>{graded ? "정답이에요" : `틀렸어요 (정답: ${question.answer})`}</strong>{question.explanation}</p>
                <button type="button" className="btn-primary trainer-next-button" onClick={() => void handleNextQuestion()}>
                  {questionNumber === questionCount ? "학습 완료" : "다음 문제"}
                </button>
              </div>
            )}
          </div>
        )}

        {question?.type === "descriptive" && (
          <div className="trainer-card">
            <p className="eyebrow">이 설명 중 한 군데가 틀렸어요</p>
            <p className="trainer-explanation">{question.explanation}</p>
            <textarea className="input trainer-guess" placeholder="어디가, 왜 틀렸다고 생각하는지 적어보세요" value={guess} onChange={(e) => setGuess(e.target.value)} rows={3} />
            <button type="button" className="btn-primary" onClick={() => setRevealed(true)} disabled={revealed}>정답 확인</button>
            {revealed && (
              <div className="trainer-reveal">
                <p><strong>틀린 부분</strong>{question.flaw}</p>
                <p><strong>올바른 설명</strong>{question.correction}</p>
                <button type="button" className="btn-primary trainer-next-button" onClick={() => { markCompleted(); void handleNextQuestion(); }}>
                  {questionNumber === questionCount ? "학습 완료" : "다음 문제"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {!data?.goal && (
        <section className="card study-goal-card">
          <div>
            <p className="eyebrow">선택: 학습 목표</p>
            <h3>시험일과 주간 목표를 정해두면 진행률을 계산해드려요</h3>
          </div>
          <div className="study-goal-form">
            <input className="input" placeholder="예: 운영체제 중간고사" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="study-field"><span>시험일</span><input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></label>
            <label className="study-field">
              <span>주간 학습 시간</span>
              <div className="study-duration-row">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={Math.floor(Number(weeklyMinutes) / 60)}
                  onChange={(e) => setWeeklyMinutes(String(Number(e.target.value) * 60 + (Number(weeklyMinutes) % 60)))}
                />
                <span>시간</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="59"
                  value={Number(weeklyMinutes) % 60}
                  onChange={(e) => setWeeklyMinutes(String(Math.floor(Number(weeklyMinutes) / 60) * 60 + Number(e.target.value)))}
                />
                <span>분</span>
              </div>
            </label>
            <label className="study-field"><span>주간 문제 수</span><input className="input" type="number" min="5" value={weeklyQuestions} onChange={(e) => setWeeklyQuestions(e.target.value)} /></label>
            <button type="button" className="btn-primary" onClick={() => void saveGoal()} disabled={!title.trim()}>학습 플랜 만들기</button>
          </div>
        </section>
      )}

      <section className="study-summary-grid">
        <div className="card study-summary-card"><span>학습 목표</span><strong>{data?.goal?.title ?? "설정 안 함"}</strong><p>{examDays === null ? "시험일을 정하지 않았어요." : `시험까지 ${examDays}일`}</p></div>
        <div className="card study-summary-card"><span>주간 진행률</span><strong>{minutesProgress}%</strong><div className="study-progress-track"><div className="study-progress-value" style={{ width: `${minutesProgress}%` }} /></div><p>{formatMinutes(data?.analytics.totalMinutes ?? 0)} / {formatMinutes(minutesTarget)}</p></div>
        <div className="card study-summary-card"><span>복습 필요</span><strong>{data?.analytics.mistakeCount ?? 0}개</strong><p>오답노트 기반 맞춤 복습</p></div>
        <div className="card study-summary-card"><span>자세 평균</span><strong>{data?.analytics.averagePosture == null ? "—" : `${data.analytics.averagePosture}/10`}</strong><p>앱 자세 기록 기준</p></div>
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
        <div className="section-heading"><div><p className="eyebrow">Spaced review</p><h3>오늘 복습할 카드</h3></div><span className="badge badge-neutral">{data?.mistakes.length ?? 0}개</span></div>
        {!data?.mistakes.length ? <p className="study-empty">오답이 쌓이면 개념 복습 카드가 여기에 만들어집니다.</p> : (
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
    </div>
  );
}
