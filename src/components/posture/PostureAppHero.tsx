export default function PostureAppHero() {
  return (
    <section className="card posture-app-hero">
      <div className="posture-app-hero-copy">
        <p className="eyebrow">AIRPODS POSTURE COACH</p>
        <h2>학습에 집중하는 동안,<br />자세는 앱이 살펴봐요.</h2>
        <p>
          AirPods Pro의 머리 움직임을 iPhone·iPad·Mac 앱에서 측정하고,
          세션이 끝나면 이 웹사이트에서 기록과 변화를 확인할 수 있습니다.
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
