"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRecognition, speak, speechUnsupportedMessage, type SpeechRecognitionLike } from "@/lib/voice";
import { fetchStudy, formatMinutes, TYPE_LABELS, type StudyData } from "@/lib/study";

type QuestionType = "ox" | "mcq" | "fill_blank" | "descriptive";
type OXQuestion = { type: "ox"; statement: string; isTrue: boolean; explanation: string };
type MCQQuestion = { type: "mcq"; question: string; options: string[]; correctIndex: number; explanation: string };
type FillBlankQuestion = { type: "fill_blank"; sentence: string; answer: string; explanation: string };
type DescriptiveQuestion = { type: "descriptive"; explanation: string; flaw: string; correction: string };
type Question = OXQuestion | MCQQuestion | FillBlankQuestion | DescriptiveQuestion;
type Attempt = { id: string; type: string; prompt: string; options: string | null; correctAnswer: string; userAnswer: string; explanation: string };
type Session = { id: string; sourceName: string; questionCount: number; createdAt: string; attempts: Attempt[] };
type RetryItem = { question: Question; attemptId: string };

const AUTO_MIX: QuestionType[] = ["mcq", "ox", "fill_blank", "descriptive"];
const QUESTION_COUNTS = [5, 10, 20] as const;

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

  // extracted once on the first question, then reused — re-parsing the same
  // PDF/PPTX on every question was the main source of slow generation.
  const lectureTextRef = useRef<string | null>(null);
  // every prompt asked so far this session, sent back to the model so it
  // doesn't repeat the same question (confirmed happening on short docs).
  const askedPromptsRef = useRef<string[]>([]);

  const [selectedOx, setSelectedOx] = useState<boolean | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [blankInput, setBlankInput] = useState("");
  const [graded, setGraded] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [quizSessionId, setQuizSessionId] = useState<string | null>(null);

  // "틀린 문제만 다시 풀기": replays a chapter's mistakes directly (no file
  // or AI call needed — the full question is already stored on the attempt).
  const [retryQueue, setRetryQueue] = useState<RetryItem[] | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const [retryComplete, setRetryComplete] = useState(false);

  // voice teaching mode: AI reads the question aloud (TTS) and listens for a spoken answer (STT).
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "asking" | "listening">("idle");
  const [voiceUnsupported, setVoiceUnsupported] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const voiceRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    fetchStudy().then(setData).catch((err) => setError(err instanceof Error ? err.message : "학습 데이터를 불러오지 못했어요."));
  }, []);

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

  function promptTextOf(q: Question): string {
    if (q.type === "ox") return q.statement;
    if (q.type === "mcq") return q.question;
    if (q.type === "fill_blank") return q.sentence;
    return q.explanation;
  }

  async function generateQuestion(num: number, targetFile?: File) {
    const cachedText = lectureTextRef.current;
    const useFile = targetFile ?? file;
    if (!cachedText && !useFile) return;
    setQuizLoading(true);
    setQuizError(null);
    // clear the previous question immediately — leaving it rendered while
    // the next one loads let you answer the stale question a second time
    // right before it swapped out from under you.
    setQuestion(null);
    resetAnswerState();
    try {
      const body = new FormData();
      // after the first question, reuse the already-extracted text instead
      // of re-uploading + re-parsing the same file every time.
      if (cachedText) body.set("text", cachedText);
      else body.set("file", useFile as File);
      body.set("type", nextTypeFor(num));
      body.set("exclude", JSON.stringify(askedPromptsRef.current));
      const res = await fetch("/api/trainer", { method: "POST", body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "문제를 만들지 못했어요.");
      if (typeof payload.sourceText === "string") lectureTextRef.current = payload.sourceText;
      setQuestion(payload);
      askedPromptsRef.current = [...askedPromptsRef.current, promptTextOf(payload)];
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
    } finally {
      setQuizLoading(false);
    }
  }

  // one "생성" click = one chapter in 오답노트: create the session row up
  // front so every mistake logged during this run can be grouped under it.
  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setQuestion(null);
    setQuestionNumber(0);
    setCompletedCount(0);
    setSessionComplete(false);
    setQuizError(null);
    setQuizSessionId(null);
    lectureTextRef.current = null;
    askedPromptsRef.current = [];
    resetAnswerState();
    if (!selected) return;
    // the whole point is "upload it and it just starts" — no extra click.
    setQuestionNumber(1);
    try {
      const res = await fetch("/api/trainer/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceName: selected.name, questionCount }),
      });
      const payload = await res.json();
      if (res.ok) setQuizSessionId(payload.id);
    } catch {
      // mistakes still log without a chapter if this fails
    }
    await generateQuestion(1, selected);
  }

  async function handleNextQuestion() {
    if (retryQueue) {
      const next = retryIndex + 1;
      if (next >= retryQueue.length) {
        setRetryQueue(null);
        setRetryIndex(0);
        setQuestion(null);
        setRetryComplete(true);
        return;
      }
      setRetryIndex(next);
      setQuestion(retryQueue[next].question);
      resetAnswerState();
      return;
    }
    if (questionNumber >= questionCount) {
      setQuestion(null);
      setSessionComplete(true);
      return;
    }
    const next = questionNumber + 1;
    setQuestionNumber(next);
    await generateQuestion(next);
  }

  const isLastQuestion = retryQueue ? retryIndex >= retryQueue.length - 1 : questionNumber === questionCount;

  function markCompleted() {
    setCompletedCount((previous) => previous + 1);
  }

  async function logMistake(args: { type: QuestionType; prompt: string; options?: string[]; correctAnswer: string; userAnswer: string; explanation: string }) {
    try {
      await fetch("/api/trainer/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...args, sessionId: quizSessionId }),
      });
      setData((prev) => (prev ? { ...prev, analytics: { ...prev.analytics, mistakeCount: prev.analytics.mistakeCount + 1 } } : prev));
    } catch {
      // the quiz experience itself doesn't depend on logging succeeding
    }
  }

  // answering a retried mistake correctly clears it from 오답노트; answering
  // it wrong again leaves the existing row as-is (no duplicate log entry).
  async function resolveRetryAttempt() {
    const attemptId = retryQueue?.[retryIndex]?.attemptId;
    if (!attemptId) return;
    try {
      await fetch(`/api/trainer/attempts/${attemptId}`, { method: "DELETE" });
      setData((prev) => (prev ? { ...prev, analytics: { ...prev.analytics, mistakeCount: Math.max(0, prev.analytics.mistakeCount - 1) } } : prev));
      setSessions((prev) => prev?.map((s) => ({ ...s, attempts: s.attempts.filter((a) => a.id !== attemptId) })) ?? null);
    } catch {
      // the retry quiz itself doesn't depend on this succeeding
    }
  }

  function answerOx(value: boolean) {
    if (!question || question.type !== "ox" || graded !== null) return;
    setSelectedOx(value);
    const isCorrect = value === question.isTrue;
    setGraded(isCorrect);
    markCompleted();
    if (retryQueue) {
      if (isCorrect) void resolveRetryAttempt();
    } else if (!isCorrect) {
      void logMistake({ type: "ox", prompt: question.statement, correctAnswer: question.isTrue ? "참" : "거짓", userAnswer: value ? "참" : "거짓", explanation: question.explanation });
    }
  }

  function answerMcq(index: number) {
    if (!question || question.type !== "mcq" || graded !== null) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    setGraded(isCorrect);
    markCompleted();
    if (retryQueue) {
      if (isCorrect) void resolveRetryAttempt();
    } else if (!isCorrect) {
      void logMistake({ type: "mcq", prompt: question.question, options: question.options, correctAnswer: question.options[question.correctIndex], userAnswer: question.options[index], explanation: question.explanation });
    }
  }

  function answerBlank(spokenValue?: string) {
    const value = (spokenValue ?? blankInput).trim();
    if (!question || question.type !== "fill_blank" || graded !== null || !value) return;
    const isCorrect = value.toLowerCase() === question.answer.trim().toLowerCase();
    setGraded(isCorrect);
    markCompleted();
    if (retryQueue) {
      if (isCorrect) void resolveRetryAttempt();
    } else if (!isCorrect) {
      void logMistake({ type: "fill_blank", prompt: question.sentence, correctAnswer: question.answer, userAnswer: value, explanation: question.explanation });
    }
  }

  // --- voice teaching mode: AI asks the question out loud, user answers by speaking ---

  function questionPromptText(q: Question): string {
    if (q.type === "ox") return q.statement;
    if (q.type === "mcq") return `${q.question} 보기는 ${q.options.map((o, i) => `${i + 1}번 ${o}`).join(", ")} 입니다.`;
    if (q.type === "fill_blank") return q.sentence.replace("____", "빈칸");
    return q.explanation;
  }

  function matchOxFromSpeech(transcript: string): boolean | null {
    const t = transcript.replace(/\s/g, "");
    if (/(거짓|아니|틀려|틀렸)/.test(t)) return false;
    if (/(참|맞아|맞다|그래)/.test(t)) return true;
    return null;
  }

  const NUMBER_WORDS = ["일", "이", "삼", "사"];
  function matchMcqFromSpeech(transcript: string, options: string[]): number | null {
    const t = transcript.replace(/\s/g, "");
    for (let i = 0; i < options.length; i++) {
      if (t.includes(`${i + 1}번`) || t.includes(`${NUMBER_WORDS[i]}번`)) return i;
    }
    const byText = options.findIndex((option) => option.trim() && t.includes(option.replace(/\s/g, "")));
    return byText >= 0 ? byText : null;
  }

  function stopVoiceListening() {
    voiceRecognitionRef.current?.stop();
    voiceRecognitionRef.current = null;
    setVoiceStatus("idle");
  }

  function listenForSpokenAnswer(onTranscript: (transcript: string) => void) {
    const recognition = createRecognition();
    if (!recognition) {
      setVoiceUnsupported(speechUnsupportedMessage());
      setVoiceStatus("idle");
      return;
    }
    voiceRecognitionRef.current = recognition;
    let handled = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        setVoiceTranscript(transcript);
        if (result.isFinal) {
          handled = true;
          recognition.stop();
          voiceRecognitionRef.current = null;
          setVoiceTranscript("");
          setVoiceStatus("idle");
          if (transcript) onTranscript(transcript);
          return;
        }
      }
    };
    recognition.onend = () => {
      voiceRecognitionRef.current = null;
      if (!handled) setVoiceStatus("idle");
    };
    try {
      recognition.start();
      setVoiceStatus("listening");
    } catch {
      setVoiceStatus("idle");
    }
  }

  function askQuestionAloud(q: Question) {
    setVoiceStatus("asking");
    speak(questionPromptText(q), () => {
      listenForSpokenAnswer((transcript) => {
        if (q.type === "ox") {
          const value = matchOxFromSpeech(transcript);
          if (value !== null) answerOx(value);
        } else if (q.type === "mcq") {
          const index = matchMcqFromSpeech(transcript, q.options);
          if (index !== null) answerMcq(index);
        } else if (q.type === "fill_blank") {
          setBlankInput(transcript);
          answerBlank(transcript);
        } else {
          setGuess(transcript);
          setRevealed(true);
        }
      });
    });
  }

  // a fresh question (new object reference) re-triggers the AI asking it aloud.
  useEffect(() => {
    if (!voiceMode || !question || graded !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    askQuestionAloud(question);
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      stopVoiceListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, voiceMode]);

  // speak the result once the answer is graded.
  useEffect(() => {
    if (!voiceMode || graded === null || !question) return;
    const resultPrefix = graded ? "정답이에요. " : "틀렸어요. ";
    const explanation = question.type === "descriptive"
      ? `틀린 부분은 ${question.flaw}. 올바른 설명은 ${question.correction}.`
      : question.explanation;
    speak(resultPrefix + explanation, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graded, voiceMode]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      voiceRecognitionRef.current?.stop();
    };
  }, []);

  async function openNotebook() {
    setView("notebook");
    try {
      const res = await fetch("/api/trainer/attempts");
      const payload = await res.json();
      if (res.ok) setSessions(payload.sessions);
    } catch {
      setSessions([]);
    }
  }

  async function deleteAttempt(id: string) {
    setSessions((prev) => prev?.map((s) => ({ ...s, attempts: s.attempts.filter((a) => a.id !== id) })) ?? null);
    await fetch(`/api/trainer/attempts/${id}`, { method: "DELETE" });
  }

  async function deleteSession(session: Session) {
    setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? null);
    if (session.id === "unassigned") return; // synthetic bucket, nothing to delete server-side
    await fetch(`/api/trainer/sessions/${session.id}`, { method: "DELETE" });
  }

  // rebuilds a question straight from a stored mistake — no file or AI call
  // needed, the gradable types already carry everything required to replay it.
  function buildRetryQuestion(attempt: Attempt): Question | null {
    if (attempt.type === "ox") {
      return { type: "ox", statement: attempt.prompt, isTrue: attempt.correctAnswer === "참", explanation: attempt.explanation };
    }
    if (attempt.type === "mcq") {
      const options: string[] = attempt.options ? JSON.parse(attempt.options) : [];
      const correctIndex = options.indexOf(attempt.correctAnswer);
      if (options.length === 0 || correctIndex < 0) return null;
      return { type: "mcq", question: attempt.prompt, options, correctIndex, explanation: attempt.explanation };
    }
    if (attempt.type === "fill_blank") {
      return { type: "fill_blank", sentence: attempt.prompt, answer: attempt.correctAnswer, explanation: attempt.explanation };
    }
    return null;
  }

  function startRetry(session: Session) {
    const queue: RetryItem[] = session.attempts
      .map((attempt) => {
        const q = buildRetryQuestion(attempt);
        return q ? { question: q, attemptId: attempt.id } : null;
      })
      .filter((item): item is RetryItem => item !== null);
    if (queue.length === 0) return;
    setRetryQueue(queue);
    setRetryIndex(0);
    setCompletedCount(0);
    setQuestionNumber(0);
    setSessionComplete(false);
    setRetryComplete(false);
    setQuestion(queue[0].question);
    resetAnswerState();
    setView("home");
  }

  const examDays = daysUntil(data?.goal?.examDate ?? null);
  const minutesTarget = data?.goal?.weeklyMinutes ?? 300;
  const minutesProgress = Math.min(100, Math.round(((data?.analytics.totalMinutes ?? 0) / minutesTarget) * 100));

  if (view === "notebook") {
    return (
      <div className="page-shell">
        <button type="button" className="link-back" onClick={() => setView("home")}>‹ 학습 코치로 돌아가기</button>
        <div className="section-heading"><div><p className="eyebrow">오답노트</p><h2 className="trainer-notebook-title">틀린 문제 모아보기</h2></div></div>
        {sessions === null && <p className="chat-empty-text">불러오는 중…</p>}
        {sessions?.length === 0 && <p className="chat-empty-text">아직 틀린 문제가 없어요.</p>}
        <div className="trainer-notebook-list">
          {sessions?.map((session) => {
            const isExpanded = expandedSessionId === session.id;
            const canRetry = session.attempts.some((a) => a.type !== "descriptive");
            return (
              <div key={session.id} className="card trainer-notebook-session">
                <button
                  type="button"
                  className="trainer-notebook-session-head"
                  onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                >
                  <div>
                    <strong>{session.sourceName}</strong>
                    <span>{new Date(session.createdAt).toLocaleDateString("ko-KR")} · {session.questionCount}문제 중 {session.attempts.length}개 오답</span>
                  </div>
                  <span className="chip">{isExpanded ? "접기" : "자세히"}</span>
                </button>
                {isExpanded && (
                  <div className="trainer-notebook-session-body">
                    <div className="trainer-notebook-session-actions">
                      {canRetry && (
                        <button type="button" className="btn-primary" onClick={() => startRetry(session)}>틀린 문제만 다시 풀기</button>
                      )}
                      <button type="button" className="btn-text-danger" onClick={() => void deleteSession(session)}>챕터 삭제</button>
                    </div>
                    <div className="trainer-notebook-list">
                      {session.attempts.map((a) => (
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
                )}
              </div>
            );
          })}
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
        <div className="study-hero-stat">
          <strong>{data?.analytics.currentStreak ? `🔥 ${data.analytics.currentStreak}일` : "0일"}</strong>
          <span>연속 학습 스트릭</span>
        </div>
      </div>

      {error && <p className="assistant-error">{error}</p>}

      {/* quiz session — upload a file and it just starts. no type/count decision required. */}
      <section className="card study-upload-card">
        <div className="section-heading">
          <div><p className="eyebrow">강의 자료 업로드</p><h3>PDF나 PPT를 올리면 바로 학습이 시작돼요</h3></div>
          <div className="study-upload-row" style={{ gap: 8 }}>
            <button
              type="button"
              className={voiceMode ? "chip chip-active" : "chip"}
              onClick={() => setVoiceMode((v) => !v)}
            >
              🎙️ 음성으로 풀기
            </button>
            <button type="button" className="chip" onClick={() => void openNotebook()}>오답노트</button>
          </div>
        </div>

        {voiceUnsupported && <p className="assistant-error">{voiceUnsupported}</p>}
        {voiceMode && question && (
          <p className="chat-empty-text">
            {voiceStatus === "asking" && "AI가 문제를 읽어주고 있어요…"}
            {voiceStatus === "listening" && (voiceTranscript ? `듣고 있어요: “${voiceTranscript}”` : "답을 말해보세요…")}
            {voiceStatus === "idle" && graded === null && "답변을 기다리고 있어요."}
          </p>
        )}

        {questionNumber === 0 && !retryQueue && !sessionComplete && (
          <div className="study-upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="btn-primary study-upload-button" onClick={() => fileInputRef.current?.click()} disabled={quizLoading}>
              {quizLoading ? "문제를 만드는 중…" : file ? file.name : "강의 자료 선택하고 바로 시작"}
            </button>
            <button type="button" className="chip" onClick={() => setShowSettings((v) => !v)}>설정</button>
          </div>
        )}
        {quizError && <p className="assistant-error">{quizError}</p>}

        {/* between questions: the old question is cleared immediately on
            "다음 문제", so this fills the gap instead of leaving a stale,
            still-answerable question on screen while the next one loads. */}
        {quizLoading && !question && questionNumber > 0 && !sessionComplete && (
          <div className="trainer-card">
            <p className="chat-empty-text">다음 문제를 만들고 있어요…</p>
          </div>
        )}

        {showSettings && questionNumber === 0 && !retryQueue && (
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

        {(questionNumber > 0 || retryQueue) && !sessionComplete && !retryComplete && (
          <div className="trainer-progress">
            <div className="trainer-progress-head">
              <span>{retryQueue ? "틀린 문제만 다시 풀기" : "학습 세션"}</span>
              <strong>{retryQueue ? retryIndex + 1 : questionNumber} / {retryQueue ? retryQueue.length : questionCount} 문제</strong>
            </div>
            <div className="trainer-progress-track">
              <div className="trainer-progress-value" style={{ width: `${(completedCount / (retryQueue ? retryQueue.length : questionCount)) * 100}%` }} />
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

        {retryComplete && (
          <div className="trainer-complete">
            <p className="eyebrow">복습 완료</p>
            <h3>틀린 문제를 모두 다시 풀었어요.</h3>
            <p>맞힌 문제는 오답노트에서 사라졌어요.</p>
            <div className="trainer-control-actions">
              <button type="button" className="chip" onClick={() => { setRetryComplete(false); void openNotebook(); }}>오답노트 보기</button>
              <button type="button" className="btn-text-danger" onClick={() => setRetryComplete(false)}>닫기</button>
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
                  {isLastQuestion ? "학습 완료" : "다음 문제"}
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
                  {isLastQuestion ? "학습 완료" : "다음 문제"}
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
              <button type="button" className="btn-primary" onClick={() => answerBlank()} disabled={graded !== null || !blankInput.trim()}>제출</button>
            </div>
            {graded !== null && (
              <div className={graded ? "trainer-reveal trainer-reveal-correct" : "trainer-reveal trainer-reveal-wrong"}>
                <p><strong>{graded ? "정답이에요" : `틀렸어요 (정답: ${question.answer})`}</strong>{question.explanation}</p>
                <button type="button" className="btn-primary trainer-next-button" onClick={() => void handleNextQuestion()}>
                  {isLastQuestion ? "학습 완료" : "다음 문제"}
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
                  {isLastQuestion ? "학습 완료" : "다음 문제"}
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
        <div className="card study-summary-card"><span>학습 감지 점수</span><strong>{data?.analytics.averagePosture == null ? "—" : `${data.analytics.averagePosture}/10`}</strong><p>AirPods로 감지한 집중도 평균</p></div>
      </section>

      <section className="card study-recommendation-card">
        <p className="eyebrow">Adaptive recommendation</p>
        <h3>오늘의 학습 제안</h3>
        <p>{recommendation}</p>
        <div className="study-next-steps"><span>1</span><p>오답 유형을 5분 복습</p><span>2</span><p>관련 문제 5개 풀이</p><span>3</span><p>틀린 이유를 한 줄 기록</p></div>
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
