"use client";

export type VoicePhase = "idle" | "ambient" | "listening" | "thinking" | "speaking";

const LABELS: Record<VoicePhase, string> = {
  idle: "꺼짐 · 눌러서 켜기",
  ambient: "\"도나\"라고 불러보세요",
  listening: "듣고 있어요…",
  thinking: "생각 중…",
  speaking: "말하는 중…",
};

export default function VoiceButton({
  phase,
  onClick,
  unsupportedMessage,
}: {
  phase: VoicePhase;
  onClick: () => void;
  unsupportedMessage?: string | null;
}) {
  if (unsupportedMessage) {
    return <span className="voice-unsupported">{unsupportedMessage}</span>;
  }

  return (
    <div className="voice-command">
      <button
        type="button"
        className={`voice-btn-prominent voice-btn-${phase}`}
        onClick={onClick}
        aria-pressed={phase !== "idle"}
        aria-label="도나"
        title="도나 켜기/끄기"
      >
        <span className="sr-only">{LABELS[phase]}</span>
      </button>
      <p className="voice-status">{LABELS[phase]}</p>
    </div>
  );
}
