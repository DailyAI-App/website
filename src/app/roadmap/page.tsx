"use client";

import { useEffect, useState } from "react";

type RoadmapStep = { id: string; title: string; detail: string | null; topics: string[]; done: boolean };
type Roadmap = { id: string; company: string; createdAt: string; steps: RoadmapStep[] };

async function fetchJSON(url: string, init?: RequestInit): Promise<{ roadmaps: Roadmap[] }> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "요청이 실패했어요.");
  return data;
}

export default function RoadmapPage() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  useEffect(() => {
    fetchJSON("/api/roadmaps")
      .then((data) => setRoadmaps(data.roadmaps))
      .catch(() => setRoadmaps([]));
  }, []);

  async function handleGenerate() {
    const trimmed = company.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "로드맵을 만들지 못했어요.");

      const saved = await fetchJSON("/api/roadmaps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: trimmed, steps: data.steps }),
      });
      setRoadmaps(saved.roadmaps);
      setActiveId(saved.roadmaps[0].id);
      setCompany("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (activeId === id) setActiveId(null);
    const data = await fetchJSON(`/api/roadmaps/${id}`, { method: "DELETE" });
    setRoadmaps(data.roadmaps);
  }

  async function handleToggleStep(roadmapId: string, stepId: string) {
    const data = await fetchJSON(`/api/roadmaps/${roadmapId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepId }),
    });
    setRoadmaps(data.roadmaps);
  }

  const active = roadmaps.find((r) => r.id === activeId) ?? null;

  if (active) {
    const doneCount = active.steps.filter((s) => s.done).length;
    const progress = active.steps.length > 0 ? Math.round((doneCount / active.steps.length) * 100) : 0;
    // the first not-yet-done step is "current" — like a Duolingo lesson
    // path, it glows; steps after it look "not reached yet" but can still
    // be toggled directly (this is a flexible checklist, not a hard gate).
    const currentIndex = active.steps.findIndex((s) => !s.done);

    return (
      <div className="page-shell">
        <button type="button" className="link-back" onClick={() => setActiveId(null)}>‹ 목록으로</button>
        <div className="card roadmap-challenge">
          <div className="roadmap-challenge-head">
            <h2>{active.company}</h2>
            <button type="button" className="btn-text-danger" onClick={() => void handleDelete(active.id)}>삭제</button>
          </div>
          <div className="roadmap-progress-track">
            <div className="roadmap-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="schedule-caption">{doneCount} / {active.steps.length} 완료</p>

          <ol className="roadmap-path">
            {active.steps.map((step, i) => {
              const isExpanded = expandedStepId === step.id;
              const isCurrent = i === currentIndex;
              const stateClass = step.done ? "roadmap-node-done" : isCurrent ? "roadmap-node-current" : "roadmap-node-locked";
              return (
                <li key={step.id} className={`roadmap-node ${stateClass}`}>
                  <div className="roadmap-node-card">
                    <button type="button" className="roadmap-node-circle-btn" onClick={() => void handleToggleStep(active.id, step.id)}>
                      <span className="roadmap-node-circle">{step.done ? "✓" : i + 1}</span>
                    </button>
                    <div className="roadmap-node-body">
                      <button type="button" className="roadmap-node-head" onClick={() => void handleToggleStep(active.id, step.id)}>
                        <span className="roadmap-node-title">{step.title}</span>
                        {isCurrent && <span className="roadmap-node-badge">지금</span>}
                      </button>
                      {step.topics.length > 0 && (
                        <div className="roadmap-node-topics">
                          {step.topics.map((topic) => (
                            <span key={topic} className="roadmap-node-topic">{topic}</span>
                          ))}
                        </div>
                      )}
                      {step.detail && (
                        <button type="button" className="roadmap-node-toggle" onClick={() => setExpandedStepId(isExpanded ? null : step.id)}>
                          {isExpanded ? "접기" : "자세히"}
                        </button>
                      )}
                      {isExpanded && step.detail && <p className="roadmap-node-detail">{step.detail}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card roadmap-composer">
        <input
          className="input"
          placeholder="회사 이름을 입력하세요 (예: 네이버)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          disabled={loading}
        />
        <button type="button" className="btn-primary" onClick={() => void handleGenerate()} disabled={loading || !company.trim()}>
          {loading ? "분석 중…" : "로드맵 만들기"}
        </button>
      </div>
      {error && <p className="assistant-error">{error}</p>}

      <div className="roadmap-list">
        {roadmaps.length === 0 && !loading && <p className="chat-empty-text">아직 만든 로드맵이 없어요.</p>}
        {roadmaps.map((r) => {
          const doneCount = r.steps.filter((s) => s.done).length;
          return (
            <div
              key={r.id}
              className="card roadmap-row"
              role="button"
              tabIndex={0}
              onClick={() => setActiveId(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setActiveId(r.id);
              }}
            >
              <div>
                <strong>{r.company}</strong>
                <p className="schedule-caption">{doneCount} / {r.steps.length} 완료</p>
              </div>
              <button
                type="button"
                className="btn-text-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(r.id);
                }}
              >
                삭제
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
