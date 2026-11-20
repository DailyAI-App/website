// shared speech-recognition + speech-synthesis helpers for the study
// page's voice teaching mode (AI reads the question aloud, listens for a
// spoken answer).

export type SpeechRecognitionAlternative = { transcript: string };
export type SpeechRecognitionResult = { isFinal: boolean; length: number; [j: number]: SpeechRecognitionAlternative };
export type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
};
export type SpeechRecognitionLike = {
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

export function createRecognition(): SpeechRecognitionLike | null {
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

export function speak(text: string, onDone: () => void) {
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

export const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "마이크 권한을 허용해주세요",
  "audio-capture": "마이크를 찾을 수 없어요",
};

export function speechUnsupportedMessage(): string | null {
  if (typeof window === "undefined") return null;
  if (createRecognition()) return null;
  return !window.isSecureContext
    ? "음성 입력은 localhost 또는 HTTPS에서만 사용할 수 있습니다."
    : "이 브라우저에서는 음성 입력을 사용할 수 없습니다. Chrome 또는 Safari에서 열어주세요.";
}
