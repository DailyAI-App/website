"use client";

import { useEffect, useRef, useState } from "react";
import VoiceButton, { type VoicePhase } from "@/components/VoiceButton";
import { cached } from "@/lib/cache";

type Exchange = { question: string; answer: string };
type ScheduleEvent = { title: string; date: string | null; detail?: string };
type HistoryTurn = { role: "user" | "assistant"; content: string };

const MAX_HISTORY_TURNS = 10;
const CONTEXT_TTL_MS = 30_000;
const WAKE_WORD_RE = /도나야?/;

// pulls the command out of an utterance like "도나 오늘 일정 알려줘" -> "오늘 일정 알려줘".
// returns null if the wake word wasn't said at all, "" if it was said alone.
function extractAfterWakeWord(transcript: string): string | null {
  const match = transcript.match(WAKE_WORD_RE);
  if (!match || match.index === undefined) return null;
  return transcript.slice(match.index + match[0].length).trim();
}

async function fetchScheduleEvents(): Promise<ScheduleEvent[]> {
  return cached("schedule-events", CONTEXT_TTL_MS, async () => {
    try {
      const res = await fetch("/api/calendar");
      if (!res.ok) return [];
      const data = await res.json();
      const events: { title: string; date: string; detail: string | null }[] = Array.isArray(data?.events)
        ? data.events
        : [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return events
        .filter((e) => new Date(e.date).getTime() >= todayStart.getTime())
        .slice(0, 8)
        .map((e) => ({ title: e.title, date: e.date, detail: e.detail ?? undefined }));
    } catch {
      return [];
    }
  });
}

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; length: number; [j: number]: SpeechRecognitionAlternative };
type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Impl) return null;
  const recognition = new Impl();
  recognition.lang = "ko-KR";
  recognition.interimResults = true;
  recognition.continuous = true;
  return recognition;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "마이크 권한을 허용해주세요",
  "audio-capture": "마이크를 찾을 수 없어요",
};

export default function ChatPanel() {
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [debugError, setDebugError] = useState("");

  const historyRef = useRef<HistoryTurn[]>([]);
  const phaseRef = useRef<VoicePhase>("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  function setPhaseState(next: VoicePhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function speak(text: string, onDone: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.onend = onDone;
    utterance.onerror = onDone;
    window.speechSynthesis.speak(utterance);
  }

  // standby: always-on mic, waiting to hear "도나" in whatever's being said nearby.
  function startAmbient() {
    const recognition = createRecognition();
    if (!recognition) {
      setUnsupported(
        typeof window !== "undefined" && !window.isSecureContext
          ? "음성 입력은 localhost 또는 HTTPS에서만 사용할 수 있습니다."
          : "이 브라우저에서는 음성 입력을 사용할 수 없습니다. Chrome 또는 Safari에서 열어주세요.",
      );
      setPhaseState("idle");
      return;
    }
    recognitionRef.current = recognition;
    setStatus(null);
    let handled = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        setLiveText(transcript);
        if (!result.isFinal) continue;
        const remainder = extractAfterWakeWord(transcript);
        if (remainder === null) continue;
        handled = true;
        recognition.stop();
        recognitionRef.current = null;
        setLiveText("");
        if (remainder) void handleTurn(remainder);
        else startListening();
        return;
      }
    };
    recognition.onerror = (event) => {
      lastErrorRef.current = event.error;
      setDebugError(`error: ${event.error} @ ${new Date().toLocaleTimeString("ko-KR")}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (handled) return;
      const err = lastErrorRef.current;
      lastErrorRef.current = null;
      if (err === "not-allowed" || err === "audio-capture") {
        setStatus(ERROR_MESSAGES[err] ?? "음성 인식에 실패했어요");
        setPhaseState("idle");
        return;
      }
      // continuous mode still times out on its own in most browsers — just keep standing by.
      if (phaseRef.current === "ambient") startAmbient();
    };
    try {
      recognition.start();
      setPhaseState("ambient");
    } catch {
      setPhaseState("idle");
    }
  }

  // active: wake word was heard, now capturing the actual command.
  function startListening() {
    const recognition = createRecognition();
    if (!recognition) {
      setPhaseState("idle");
      return;
    }
    recognitionRef.current = recognition;
    let handled = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        setLiveText(transcript);
        if (result.isFinal) {
          handled = true;
          recognition.stop();
          recognitionRef.current = null;
          setLiveText("");
          if (transcript) void handleTurn(transcript);
          else startAmbient();
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      lastErrorRef.current = event.error;
      setDebugError(`error: ${event.error} @ ${new Date().toLocaleTimeString("ko-KR")}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (handled) return;
      const err = lastErrorRef.current;
      lastErrorRef.current = null;
      if (err === "not-allowed" || err === "audio-capture") {
        setStatus(ERROR_MESSAGES[err] ?? "음성 인식에 실패했어요");
        setPhaseState("idle");
        return;
      }
      // said "도나" then nothing followed — drop back to standby instead of waiting forever.
      startAmbient();
    };
    try {
      recognition.start();
      setPhaseState("listening");
    } catch {
      startAmbient();
    }
  }

  async function handleTurn(message: string) {
    setPhaseState("thinking");

    const scheduleEvents = await fetchScheduleEvents();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          history: historyRef.current,
          scheduleEvents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "요청이 실패했어요.");

      setExchange({ question: message, answer: data.reply });
      const newTurns: HistoryTurn[] = [
        { role: "user", content: message },
        { role: "assistant", content: data.reply },
      ];
      historyRef.current = [...historyRef.current, ...newTurns].slice(-MAX_HISTORY_TURNS);

      setPhaseState("speaking");
      speak(data.reply, () => {
        if (phaseRef.current !== "idle") startAmbient();
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
      if (phaseRef.current !== "idle") startAmbient();
    }
  }

  useEffect(() => {
    // Warm the schedule cache so the first turn doesn't pay the fetch latency.
    void fetchScheduleEvents();

    // ponytail: mic access without a user gesture silently does nothing in
    // Chrome/Safari (no error, no result) — browsers require a real click to
    // open the mic at all. So the first "도나" needs one tap; after that,
    // standby keeps re-arming itself with no further taps per turn.

    return () => {
      phaseRef.current = "idle";
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  function toggleAssistant() {
    if (phaseRef.current === "idle") {
      startAmbient();
    } else {
      setPhaseState("idle");
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
  }

  return (
    <div className="assistant-shell">
      <div className="assistant-orb-area">
        <VoiceButton phase={phase} onClick={toggleAssistant} unsupportedMessage={unsupported} />
        {(phase === "ambient" || phase === "listening") && liveText && (
          <p className="voice-live-text">{liveText}</p>
        )}
        {debugError && <p className="voice-live-text">{debugError}</p>}
      </div>

      <div className="assistant-result">
        {!exchange && phase === "idle" && !status && (
          <p className="assistant-placeholder">도나가 꺼져 있어요. 눌러서 켜주세요.</p>
        )}
        {status && phase === "idle" && <p className="assistant-error">{status}</p>}
        {exchange && (
          <div className="assistant-exchange">
            <p className="assistant-question">{exchange.question}</p>
            <p className="assistant-answer">{exchange.answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
