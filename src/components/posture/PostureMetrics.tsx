import type { PostureStats } from "@/lib/posture";

export default function PostureMetrics({ stats }: { stats: PostureStats | null }) {
  const bestScore = stats?.samples.length ? Math.max(...stats.samples.map((sample) => sample.score)) : null;
  return (
    <div className="posture-metric-grid">
      <div className="card posture-metric-card">
        <span>오늘 평균</span>
        <strong>{stats?.average == null ? "-" : stats.average.toFixed(1)}</strong>
        <small>{stats?.average != null && stats.average >= 7 ? "좋은 흐름이에요" : "측정을 시작해보세요"}</small>
      </div>
      <div className="card posture-metric-card">
        <span>측정 세션</span>
        <strong>{stats?.count ?? 0}</strong>
        <small>오늘 기록된 샘플</small>
      </div>
      <div className="card posture-metric-card posture-metric-alert">
        <span>주의가 필요했던 순간</span>
        <strong>{stats?.abnormalCount ?? 0}</strong>
        <small>{bestScore == null ? "아직 데이터가 없어요" : `최고 점수 ${bestScore.toFixed(1)}점`}</small>
      </div>
    </div>
  );
}
