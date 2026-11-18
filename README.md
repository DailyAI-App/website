# 데일리 AI

일정, 음성 비서, 취업 로드맵, 학습 코치(PDF/PPT 기반 퀴즈 + 오답노트), 자세
코칭을 제공하는 개인용 멀티플랫폼 앱입니다. 웹은 Next.js로, 네이티브 앱은
SwiftUI(iOS/iPadOS/macOS)로 구성되어 있습니다.

## 주요 기능

| 기능 | 설명 | 저장 방식 |
| --- | --- | --- |
| 오늘 | 음성 비서 `도나`, 계정별 일정 브리핑 | Neon Postgres |
| 일정 | 월간 캘린더, 일정 생성·수정·삭제 | Neon Postgres |
| 로드맵 | 사람인 채용공고 기반 AI 학습 로드맵 | Neon Postgres |
| 학습 코치 | PDF·PPT 업로드 → 자동으로 OX/객관식/빈칸/서술형 퀴즈 시작(유형·문제 수는 선택), 오답노트, 시험 목표·집중 세션·주간 리포트 | Neon Postgres |
| 자세 코칭 | 웹은 휴대폰 기울기 센서로 체험, 네이티브 앱은 AirPods Pro 머리 움직임으로 측정 | 동일한 자세 API |

모든 웹 데이터는 Clerk 사용자 계정에 연결됩니다. 음성 비서는 일정 페이지에서
관리하는 DB 일정을 그대로 참고합니다. 학습 코치는 업로드한 자료로 바로 퀴즈를
시작해 유형/문제 수를 미리 고르지 않아도 되고, 오답 유형·집중 세션·AirPods
자세 기록을 합쳐 다음 학습 행동을 추천합니다. 네이티브 앱은 `/posture`에서
발급한 사용자별 연동 키로 **모든** 기능(일정/로드맵/학습 코치/자세)에서 동일한
계정에 접근합니다.

## 기술 스택

- **Web**: Next.js App Router, React, TypeScript
- **Auth**: Clerk (웹), 연동 키(Bearer 토큰, 네이티브 앱)
- **Database**: Neon Postgres, Drizzle ORM
- **AI**: OpenAI 호환 AI Gateway
- **문서 텍스트 추출**: officeparser (PDF, PPTX)
- **Native**: SwiftUI, CoreMotion, iOS/iPadOS/macOS

## 프로젝트 구조

```text
src/
├── app/                    # 페이지와 API Route Handler
├── components/             # 재사용 UI
├── hooks/                  # 데이터 동기화
├── lib/                    # 도메인 로직과 외부 API
└── db/                     # Drizzle 스키마·DB 연결
```

웹과 네이티브 앱은 서로 다른 폴더에서 관리합니다. 이 저장소에는 웹
프로젝트만 포함하며, 네이티브 앱들은 전부 `~/Develop/apps/`에 모아둡니다 —
이 프로젝트는 `~/Develop/apps/DailyAI/`를 씁니다.

### 인증 흐름 — 모든 `/api/*`가 공통으로 따르는 패턴

```text
웹 브라우저 ──── Clerk 세션 쿠키 ────┐
                                    ├─ src/lib/auth.ts resolveUserId() ─ Neon Postgres
네이티브 앱 ── Authorization: Bearer <연동 키> ─┘
```

`src/lib/auth.ts`의 `resolveUserId`가 모든 API 라우트에서 공통으로 쓰입니다.
`Authorization: Bearer` 헤더가 있으면 그 키로, 없으면 Clerk 세션으로 사용자를
찾습니다. `proxy.ts`는 `/api/*`를 미들웨어 레벨에서 막지 않고(Clerk이 권장하는
"리소스 단위 인증" 패턴), 각 라우트가 직접 401을 반환합니다 — 그래서 네이티브
앱이 일정/로드맵/학습 코치/자세 전부를 연동 키 하나로 쓸 수 있습니다.

자세 코칭만 보면: 웹은 `DeviceOrientation`(휴대폰 기울기)로 체험용 측정을
제공하고, 네이티브 앱은 AirPods Pro의 실제 머리 움직임(`CMHeadphoneMotionManager`)을
읽어 더 정밀하게 측정합니다. 자세 점수는 0~10 범위이며 5 미만은 주의 상태로
집계됩니다.

## 웹 실행

### 1. 설치

```bash
npm install
```

### 2. 환경변수

```bash
cp .env.example .env
```

`.env`에 필요한 값을 입력합니다. `.env.local`은 Vercel CLI가 생성한
로컬 파일이라 커밋하지 않습니다.

### 3. 데이터베이스 반영

```bash
npx drizzle-kit push
```

### 4. 개발 서버

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.
로그인하지 않으면 Clerk 로그인 화면으로 이동합니다.

## 환경변수

### 애플리케이션에서 직접 사용하는 변수

| 변수 | 필수 기능 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 로그인 사용자 데이터 전체 | Neon Postgres 연결 문자열 |
| `CLERK_SECRET_KEY` | 로그인 | Clerk 서버 키 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 로그인 | Clerk 공개 키 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | 로그인 | 기본값 `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | 로그인 | 기본값 `/sign-up` |
| `GATEWAY_API_KEY` | 오늘·로드맵·학습 코치 | AI Gateway 키 |
| `SARAMIN_API_KEY` | 로드맵 | 사람인 Open API 키 |

선택 기능의 키가 없으면 해당 기능만 비활성화됩니다. 로그인과
`DATABASE_URL`은 계정별 데이터를 사용하기 위해 필요합니다.

### 사용하지 않는 Vercel/Neon 자동 생성 변수

`DATABASE_URL_UNPOOLED`, `PGHOST`, `PGUSER`, `PGPASSWORD`,
`POSTGRES_*`, `NEON_*`, `VERCEL_OIDC_TOKEN`, `VITE_NEON_AUTH_URL`은
현재 애플리케이션 코드에서 읽지 않습니다. Vercel이 연결 과정에서
자동 생성한 값은 배포 환경에 남아 있어도 되지만, 새로 작성하는
`.env`에는 추가하지 않습니다.

## 네이티브 앱 실행

```bash
cd ~/Develop/apps/DailyAI
xcodegen generate   # XcodeGen 필요: brew install xcodegen
open DailyAI.xcodeproj
```

Xcode에서:

1. `DailyAI` 스킴: iPhone/iPad
2. `DailyAIMac` 스킴: macOS ("My Mac")
3. Signing & Capabilities에서 Apple Developer Team 선택
4. 앱의 설정 탭(또는 첫 실행 연결 화면)에 서버 주소와 `/posture`에서 발급한
   연동 키를 입력 — 이 키 하나로 일정/로드맵/학습 코치/자세 전부 연동됩니다.
5. 자세 코칭은 실제 AirPods가 연결된 기기에서 실행해야 측정됩니다 (시뮬레이터 불가).

TestFlight 배포 절차와 구현 범위는 `~/Develop/apps/DailyAI/README.md`를 참고합니다.

## 명령어

```bash
npm run dev       # 개발 서버
npm run lint      # ESLint
npm run build     # 프로덕션 빌드
npm run start     # 프로덕션 서버
npx tsc --noEmit  # TypeScript 검사
npx drizzle-kit push
```

## 배포 전 체크리스트

- HTTPS API 주소 설정
- Clerk production 키 설정
- Neon production 데이터베이스 설정
- 모바일 API 키 Keychain 저장 확인
- 실제 iPhone/iPad와 AirPods에서 센서 권한 테스트
- 개인정보처리방침·지원 페이지 준비
- Apple Developer 서명 후 TestFlight 업로드

`.env`, `.env.local`, API 키, DB 연결 문자열은 저장소에 커밋하지 않습니다.
