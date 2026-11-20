export default function PostureAppHero() {
  return (
    <section className="card posture-app-hero">
      <div className="posture-app-hero-copy">
        <p className="eyebrow">AIRPODS STUDY DETECTION</p>
        <h2>지금 공부 중인지,<br />AirPods가 판단해요.</h2>
        <p>
          AirPods Pro의 착용 여부와 머리 움직임 안정도를 iPhone·iPad·Mac 앱에서 읽어
          &ldquo;학습 중&rdquo; 신호로 바꾸고, 학습 코치의 집중 세션과 스트릭에 반영합니다.
        </p>
        <span className="posture-app-status">TestFlight 앱 준비 중</span>
      </div>
      <div className="posture-app-hero-visual" aria-hidden="true">
        <div className="posture-app-orbit posture-app-orbit-outer" />
        <div className="posture-app-orbit posture-app-orbit-inner" />
        <div className="posture-app-device">⌁</div>
      </div>
    </section>
  );
}
