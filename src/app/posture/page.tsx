"use client";

import PostureActivityChart from "@/components/posture/PostureActivityChart";
import PostureAppHero from "@/components/posture/PostureAppHero";
import PostureIntegrationKeyCard from "@/components/posture/PostureIntegrationKeyCard";
import PostureMetrics from "@/components/posture/PostureMetrics";
import PostureSetupSteps from "@/components/posture/PostureSetupSteps";
import { usePostureData } from "@/hooks/use-posture-data";

export default function PosturePage() {
  const { stats, error } = usePostureData();

  return (
    <div className="page-shell posture-page">
      <header className="posture-page-header">
        <div>
          <p className="eyebrow">POSTURE COACH</p>
          <h1>더 바른 하루를 위한 기록.</h1>
          <p>AirPods 자세 코칭 앱에서 측정한 나의 학습 기록을 한눈에 확인하세요.</p>
        </div>
        <span className="posture-date">앱 기록 대시보드</span>
      </header>

      <PostureAppHero />
      <PostureMetrics stats={stats} />

      <section className="posture-content-grid">
        <PostureActivityChart stats={stats} />
        <PostureSetupSteps />
      </section>

      <PostureIntegrationKeyCard />
      {error && <p className="assistant-error posture-page-error">{error}</p>}
    </div>
  );
}
