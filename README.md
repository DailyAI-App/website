# 데일리 AI

오늘의 집중 세션(타이머 + AirPods 자동 학습 감지 + 연속 학습 스트릭), 일정,
AI 취업 로드맵, 학습 코치(PDF/PPT 기반 퀴즈 + 오답노트), AirPods 학습 감지를
제공하는 개인용 멀티플랫폼 앱입니다. 웹은 Next.js로, 네이티브 앱은
SwiftUI(iOS/iPadOS/macOS)로 구성되어 있습니다.

## 주요 기능

| 기능 | 설명 | 저장 방식 |
| --- | --- | --- |
| 오늘 | 집중 세션 타이머("집중 시작"을 누르면 AirPods가 자동으로 학습 중인지 감지), 이번 주 학습 시간·연속 학습 스트릭, 열품타 스타일 "오늘의 타임로그" | Neon Postgres |
| 일정 | 월간 캘린더, 일정 생성·수정·삭제 | Neon Postgres |
| 로드맵 | 회사 + 직업/직무를 입력하면 AI가 실시간 웹 검색으로 실제 채용 요건을 찾아 roadmap.sh 스타일 마인드맵(단계별 가지치기 토픽)으로 로드맵 생성. 단계·토픽 각각 개별 체크 가능, 완료 시 듀오링고 스타일로 다음 단계가 강조됨 | Neon Postgres |
| 학습 코치 | PDF·PPT 업로드 → 전체 퀴즈(OX/객관식/빈칸/서술형)를 한 번에 배치 생성(유형·문제 수는 선택), 음성으로 묻고 답하는 학습 모드, 생성 세션(챕터)별로 묶인 오답노트 + "틀린 문제만 다시 풀기", 학습 목표·주간 리포트 | Neon Postgres |
| 학습 감지 | AirPods 착용·머리 안정성으로 "지금 학습 중인지"를 판단(자세 교정이 아님). 웹은 네이티브 앱이 올린 기록을 보여주고, 네이티브 앱은 실제 센서(`CMHeadphoneMotionManager`)로 측정하며 일정 시간 학습이 확인되지 않으면 알림을 보냄 | 동일한 학습 감지 API |

모든 웹 데이터는 Clerk 사용자 계정에 연결됩니다. 로드맵은 사람인 API 없이
AI(웹 검색 모델)가 직접 채용 정보를 찾아 생성합니다 — 개발 직무로 한정되지
않고 입력한 어떤 직업/직무든 그에 맞는 로드맵을 만듭니다. 학습 코치는
업로드한 자료로 바로 퀴즈를 시작해 유형/문제 수를 미리 고르지 않아도 되고,
오답 유형·집중 세션·AirPods 학습 감지 기록을 합쳐 다음 학습 행동을
추천합니다. 네이티브 앱은 `/posture`에서 발급한 사용자별 연동 키로 **모든**
기능(오늘/일정/로드맵/학습 코치/학습 감지)에서 동일한 계정에 접근합니다.

## 기술 스택

- **Web**: Next.js App Router, React, TypeScript
- **Auth**: Clerk (웹), 연동 키(Bearer 토큰, 네이티브 앱)
- **Database**: Neon Postgres, Drizzle ORM
- **AI**: OpenAI 호환 AI Gateway — 학습 코치 퀴즈 생성은 Claude Sonnet 5, 로드맵
  생성은 실시간 웹 검색을 하는 Perplexity `sonar-pro`
- **문서 텍스트 추출**: officeparser (PDF, PPTX)
- **Native**: SwiftUI, CoreMotion, Speech/AVFoundation(음성 학습 모드),
  UserNotifications, iOS/iPadOS/macOS

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
앱이 오늘/일정/로드맵/학습 코치/학습 감지 전부를 연동 키 하나로 쓸 수 있습니다.

학습 감지만 보면: `posture_samples` 테이블과 `/api/posture` 경로 이름은
예전 "자세 교정" 기능 때 이름 그대로 남아 있지만, 지금은 AirPods 착용 여부와
머리 움직임 안정성으로 "학습 중인지"를 판단하는 용도로 쓰입니다(스키마 변경
없이 의미만 바꿨습니다 — `src/db/schema.ts`의 주석 참고). 점수는 0~10
범위이며 5 미만은 "학습 이탈"로 집계됩니다.

로드맵은 Saramin Open API를 더 이상 쓰지 않습니다 — `sonar-pro` 모델이 회사와
직무를 받아 직접 웹을 검색해 실제 채용 요건을 찾고, 그 내용으로 각 단계의
제목·하위 토픽·상세 설명을 생성합니다.

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
| `GATEWAY_API_KEY` | 로드맵(웹 검색), 학습 코치(퀴즈 생성) | AI Gateway 키 |

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
   연동 키를 입력 — 이 키 하나로 오늘/일정/로드맵/학습 코치/학습 감지 전부
   연동됩니다.
5. "오늘" 탭에서 집중 세션을 시작하면 AirPods 학습 감지가 자동으로 켜집니다.
   학습 감지와 음성 학습 모드는 실제 기기(AirPods·마이크)에서 실행해야
   동작합니다 (시뮬레이터에서는 제한적).

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
- 실제 iPhone/iPad와 AirPods에서 센서·알림·음성 권한 테스트
- 개인정보처리방침·지원 페이지 준비
- Apple Developer 서명 후 TestFlight 업로드

`.env`, `.env.local`, API 키, DB 연결 문자열은 저장소에 커밋하지 않습니다.
