import type { PostureStats } from "@/lib/posture";
import { timeLabel } from "@/lib/posture";

export default function PostureActivityChart({ stats }: { stats: PostureStats | null }) {
  const samples = stats?.samples.slice(-24) ?? [];
  return (
    <div className="card posture-history-card">
      <div className="posture-card-heading">
        <div><p className="eyebrow">ACTIVITY</p><h2>오늘의 자세 흐름</h2></div>
        <span className="status-dot">자동 저장</span>
      </div>
      {samples.length > 0 ? (
        <div className="posture-chart" aria-label="오늘의 자세 점수 그래프">
          {samples.map((sample, index) => (
            <div className="posture-chart-column" key={`${sample.capturedAt}-${index}`}>
              <div
                className={sample.score < 5 ? "posture-chart-bar posture-chart-bar-low" : "posture-chart-bar"}
                style={{ height: `${Math.max(10, sample.score * 10)}%` }}
                title={`${sample.score.toFixed(1)}점 · ${timeLabel(sample.capturedAt)}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="posture-empty-state"><strong>첫 기록을 남겨보세요</strong><span>오늘의 자세 흐름이 이곳에 표시됩니다.</span></div>
      )}
      <div className="posture-chart-legend"><span><i className="legend-dot legend-dot-good" />안정적</span><span><i className="legend-dot legend-dot-low" />주의</span></div>
    </div>
  );
}
