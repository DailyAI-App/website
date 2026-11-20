export default function PostureSetupSteps() {
  return (
    <div className="card posture-steps-card">
      <p className="eyebrow">HOW IT WORKS</p>
      <h2>처음 한 번만 설정하면 돼요</h2>
      <ol className="posture-steps">
        <li><span>01</span><div><strong>앱 설치</strong><p>TestFlight에서 iPhone, iPad 또는 Mac 앱을 설치합니다.</p></div></li>
        <li><span>02</span><div><strong>AirPods 연결</strong><p>AirPods Pro를 연결하면 앱이 착용 여부와 머리 움직임으로 학습 중 여부를 자동으로 판단합니다.</p></div></li>
        <li><span>03</span><div><strong>기록 확인</strong><p>학습 세션이 끝나면 이 웹사이트에서 감지 점수와 흐름을 확인합니다.</p></div></li>
      </ol>
    </div>
  );
}
