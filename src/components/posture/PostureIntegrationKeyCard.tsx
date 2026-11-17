"use client";

import { useEffect, useState } from "react";

export default function PostureIntegrationKeyCard() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    void fetch("/api/api-key")
      .then(async (response) => {
        const data = (await response.json()) as { key?: string };
        if (response.ok) setApiKey(data.key ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function regenerateKey() {
    setKeyVisible(false);
    setKeyCopied(false);
    const response = await fetch("/api/api-key", { method: "POST" });
    const data = (await response.json()) as { key?: string };
    if (response.ok) setApiKey(data.key ?? null);
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setKeyCopied(true);
    window.setTimeout(() => setKeyCopied(false), 1500);
  }

  return (
    <section className="card posture-key-card">
      <p className="eyebrow">연동 키</p>
      <h2>앱·스크립트 연동용 API 키</h2>
      <p className="schedule-caption">이 키를 모바일 앱에 입력하면 로그인 세션 없이도 이 계정으로 점수가 기록됩니다. 외부에 노출되면 즉시 재발급하세요.</p>
      <div className="posture-key-row">
        <code className="posture-key-value">{apiKey ? (keyVisible ? apiKey : "•".repeat(Math.min(apiKey.length, 32))) : "불러오는 중…"}</code>
        <button type="button" className="chip" onClick={() => setKeyVisible((visible) => !visible)} disabled={!apiKey}>{keyVisible ? "숨기기" : "표시"}</button>
        <button type="button" className="chip" onClick={() => void copyKey()} disabled={!apiKey}>{keyCopied ? "복사됨" : "복사"}</button>
        <button type="button" className="btn-text-danger" onClick={() => void regenerateKey()} disabled={!apiKey}>재발급</button>
      </div>
    </section>
  );
}
