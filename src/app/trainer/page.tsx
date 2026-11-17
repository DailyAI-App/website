"use client";

import { useRef, useState } from "react";

type QuestionType = "ox" | "mcq" | "fill_blank" | "descriptive";

type OXQuestion = { type: "ox"; statement: string; isTrue: boolean; explanation: string };
type MCQQuestion = { type: "mcq"; question: string; options: string[]; correctIndex: number; explanation: string };
type FillBlankQuestion = { type: "fill_blank"; sentence: string; answer: string; explanation: string };
type DescriptiveQuestion = { type: "descriptive"; explanation: string; flaw: string; correction: string };
type Question = OXQuestion | MCQQuestion | FillBlankQuestion | DescriptiveQuestion;

type Attempt = {
  id: string;
  type: string;
  prompt: string;
  options: string | null;
  correctAnswer: string;
  userAnswer: string;
  explanation: string;
  createdAt: string;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  ox: "OX",
  mcq: "객관식",
  fill_blank: "빈칸 채우기",
  descriptive: "오류 찾기",
};
const QUESTION_COUNTS = [5, 10, 20] as const;

export default function TrainerPage() {
  const [mode, setMode] = useState<"quiz" | "notebook">("quiz");
  const [questionType, setQuestionType] = useState<QuestionType>("ox");
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // answer state, reset per question
  const [selectedOx, setSelectedOx] = useState<boolean | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [blankInput, setBlankInput] = useState("");
  const [graded, setGraded] = useState<boolean | null>(null); // null = not graded yet, else isCorrect
  const [revealed, setRevealed] = useState(false); // descriptive type only
  const [guess, setGuess] = useState(""); // descriptive type only

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [notebookLoading, setNotebookLoading] = useState(false);

  function resetAnswerState() {
    setSelectedOx(null);
    setSelectedIndex(null);
    setBlankInput("");
    setGraded(null);
    setRevealed(false);
    setGuess("");
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setQuestion(null);
    setQuestionNumber(0);
    setCompletedCount(0);
    setSessionComplete(false);
    setError(null);
    resetAnswerState();
  }

  async function generateQuestion() {
    if (!file) return;
    setLoading(true);
    setError(null);
    resetAnswerState();
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("type", questionType);
      const res = await fetch("/api/trainer", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "문제를 만들지 못했어요.");
      setQuestion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function startSession() {
    setQuestionNumber(1);
    setCompletedCount(0);
    setSessionComplete(false);
    await generateQuestion();
  }

  async function handleNextQuestion() {
    if (questionNumber >= questionCount) {
      setQuestion(null);
      setSessionComplete(true);
      return;
    }
    setQuestionNumber((previous) => previous + 1);
    await generateQuestion();
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
      void logMistake({
        type: "ox",
        prompt: question.statement,
        correctAnswer: question.isTrue ? "참" : "거짓",
        userAnswer: value ? "참" : "거짓",
        explanation: question.explanation,
      });
    }
  }

  function answerMcq(index: number) {
    if (!question || question.type !== "mcq" || graded !== null) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    setGraded(isCorrect);
    markCompleted();
    if (!isCorrect) {
      void logMistake({
        type: "mcq",
        prompt: question.question,
        options: question.options,
        correctAnswer: question.options[question.correctIndex],
        userAnswer: question.options[index],
        explanation: question.explanation,
      });
    }
  }

  function answerBlank() {
    if (!question || question.type !== "fill_blank" || graded !== null || !blankInput.trim()) return;
    const isCorrect = blankInput.trim().toLowerCase() === question.answer.trim().toLowerCase();
    setGraded(isCorrect);
    markCompleted();
    if (!isCorrect) {
      void logMistake({
        type: "fill_blank",
        prompt: question.sentence,
        correctAnswer: question.answer,
        userAnswer: blankInput.trim(),
        explanation: question.explanation,
      });
    }
  }

  async function openNotebook() {
    setMode("notebook");
    setNotebookLoading(true);
    try {
      const res = await fetch("/api/trainer/attempts");
      const data = await res.json();
      if (res.ok) setAttempts(data.attempts);
    } catch {
      setAttempts([]);
    } finally {
      setNotebookLoading(false);
    }
  }

  async function deleteAttempt(id: string) {
    setAttempts((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/trainer/attempts/${id}`, { method: "DELETE" });
  }

  if (mode === "notebook") {
    return (
      <div className="page-shell">
        <div className="control-panel">
          <div className="control-panel-inner">
            <div className="control-group">
              <button type="button" className="chip" onClick={() => setMode("quiz")}>‹ 문제 풀기</button>
            </div>
            <h2 className="trainer-notebook-title">오답노트</h2>
          </div>
        </div>

        {notebookLoading && <p className="chat-empty-text">불러오는 중…</p>}
        {!notebookLoading && attempts.length === 0 && <p className="chat-empty-text">아직 틀린 문제가 없어요.</p>}

        <div className="trainer-notebook-list">
          {attempts.map((a) => (
            <div key={a.id} className="card trainer-notebook-item">
              <div className="trainer-notebook-item-head">
                <span className="badge badge-neutral">{TYPE_LABELS[a.type as QuestionType] ?? a.type}</span>
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
    <div className="page-shell">
      <div className="control-panel">
        <div className="control-panel-inner">
          <div className="control-group">
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={t === questionType ? "chip chip-active" : "chip"}
                onClick={() => {
                  setQuestionType(t);
                  setQuestion(null);
                  setQuestionNumber(0);
                  setCompletedCount(0);
                  setSessionComplete(false);
                  resetAnswerState();
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="trainer-control-actions">
            <div className="trainer-count-picker" aria-label="문제 수 선택">
              <span>문제 수</span>
              {QUESTION_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={questionCount === count ? "chip chip-active" : "chip"}
                  onClick={() => {
                    setQuestionCount(count);
                    setQuestion(null);
                    setQuestionNumber(0);
                    setCompletedCount(0);
                    setSessionComplete(false);
                    resetAnswerState();
                  }}
                >
                  {count}개
                </button>
              ))}
            </div>
            <button type="button" className="chip" onClick={() => void openNotebook()}>오답노트</button>
          </div>
        </div>
      </div>

      <div className="card roadmap-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="chip" onClick={() => fileInputRef.current?.click()}>
          {file ? file.name : "강의 자료 PDF 선택"}
        </button>
        <button type="button" className="btn-primary" onClick={() => void startSession()} disabled={loading || !file}>
          {loading ? "분석 중…" : "학습 시작"}
        </button>
      </div>
      {error && <p className="assistant-error">{error}</p>}

      {questionNumber > 0 && !sessionComplete && (
        <div className="trainer-progress">
          <div className="trainer-progress-head">
            <span>자기주도 학습 세션</span>
            <strong>{questionNumber} / {questionCount} 문제</strong>
          </div>
          <div className="trainer-progress-track">
            <div className="trainer-progress-value" style={{ width: `${(completedCount / questionCount) * 100}%` }} />
          </div>
          <p>정답을 확인한 뒤 원하는 속도로 다음 문제를 진행하세요.</p>
        </div>
      )}

      {sessionComplete && (
        <div className="card trainer-complete">
          <p className="eyebrow">학습 세션 완료</p>
          <h2>{questionCount}문제를 모두 풀었어요.</h2>
          <p>오답은 오답노트에 저장되어 있어요. 다시 풀거나 다른 유형으로 이어서 학습할 수 있습니다.</p>
          <button type="button" className="btn-primary" onClick={() => void startSession()} disabled={loading || !file}>
            같은 조건으로 다시 시작
          </button>
        </div>
      )}

      {question?.type === "ox" && (
        <div className="card trainer-card">
          <p className="eyebrow">참일까요, 거짓일까요?</p>
          <p className="trainer-explanation">{question.statement}</p>
          <div className="trainer-ox-row">
            <button
              type="button"
              className={selectedOx === true ? "btn-primary" : "chip"}
              onClick={() => answerOx(true)}
              disabled={graded !== null}
            >
              참
            </button>
            <button
              type="button"
              className={selectedOx === false ? "btn-primary" : "chip"}
              onClick={() => answerOx(false)}
              disabled={graded !== null}
            >
              거짓
            </button>
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
        <div className="card trainer-card">
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
        <div className="card trainer-card">
          <p className="eyebrow">빈칸에 들어갈 말은?</p>
          <p className="trainer-explanation">{question.sentence}</p>
          <div className="trainer-ox-row">
            <input
              className="input"
              placeholder="정답 입력"
              value={blankInput}
              onChange={(e) => setBlankInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && answerBlank()}
              disabled={graded !== null}
            />
            <button type="button" className="btn-primary" onClick={answerBlank} disabled={graded !== null || !blankInput.trim()}>
              제출
            </button>
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
        <div className="card trainer-card">
          <p className="eyebrow">이 설명 중 한 군데가 틀렸어요</p>
          <p className="trainer-explanation">{question.explanation}</p>

          <textarea
            className="input trainer-guess"
            placeholder="어디가, 왜 틀렸다고 생각하는지 적어보세요"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            rows={3}
          />
          <button type="button" className="btn-primary" onClick={() => setRevealed(true)} disabled={revealed}>
            정답 확인
          </button>

          {revealed && (
            <div className="trainer-reveal">
              <p><strong>틀린 부분</strong>{question.flaw}</p>
              <p><strong>올바른 설명</strong>{question.correction}</p>
              <button type="button" className="btn-primary trainer-next-button" onClick={() => {
                markCompleted();
                void handleNextQuestion();
              }}>
                {questionNumber === questionCount ? "학습 완료" : "다음 문제"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
