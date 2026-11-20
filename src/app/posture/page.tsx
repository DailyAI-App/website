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
          <p className="eyebrow">STUDY PRESENCE</p>
          <h1>AirPods로 학습 중인지 감지해요.</h1>
          <p>AirPods 착용 상태와 머리 움직임으로 지금 학습 중인지 판단해 학습 코치 기록에 반영합니다.</p>
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
