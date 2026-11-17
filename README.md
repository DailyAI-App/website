# 데일리 AI

일정, 음성 비서, 취업 로드맵, 학습 트레이너, 자세 코칭을 제공하는
개인용 멀티플랫폼 앱입니다. 웹은 Next.js로, 자세 측정 앱은 SwiftUI로
구성되어 있습니다.

## 주요 기능

| 기능 | 설명 | 저장 방식 |
| --- | --- | --- |
| 오늘 | 음성 비서 `도나`, 계정별 일정 브리핑 | Neon Postgres |
| 일정 | 월간 캘린더, 일정 생성·수정·삭제 | Neon Postgres |
| 로드맵 | 사람인 채용공고 기반 AI 학습 로드맵 | Neon Postgres |
| 학습 코치 | 시험 목표, 집중 세션, 오답 복습 카드, 주간 학습 리포트 | Neon Postgres |
| 학습 트레이너 | PDF 기반 OX·객관식·빈칸·서술형 문제 | Neon Postgres |
| 웹 자세 코칭 | AirPods 자세 코칭 앱 소개와 기록 확인 | Neon Postgres |
| 모바일 자세 코칭 | AirPods Pro 머리 움직임 측정 | 동일한 자세 API |

모든 웹 데이터는 Clerk 사용자 계정에 연결됩니다. 음성 비서는 일정 페이지에서
관리하는 DB 일정을 그대로 참고합니다. 학습 코치는 시험일까지 남은 기간,
오답 유형, 집중 세션, AirPods 자세 기록을 합쳐 다음 학습 행동을 추천합니다.
모바일 앱은
`/posture`에서 발급한 사용자별 연동 키로 동일한 계정에 데이터를 기록합니다.

## 기술 스택

- **Web**: Next.js App Router, React, TypeScript
- **Auth**: Clerk
- **Database**: Neon Postgres, Drizzle ORM
- **AI**: OpenAI 호환 AI Gateway
- **Mobile**: SwiftUI, CoreMotion, iOS/iPadOS/macOS

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
프로젝트만 포함하며, 네이티브 앱은 저장소와 나란히 있는
`../apps/PostureCoach/` 폴더에서 관리합니다.

### 자세 코칭 데이터 흐름

```text
웹 기록 확인 ──────┐
                  ├─ POST /api/posture ─ Neon Postgres
AirPods 모바일 앱 ─┘
```

웹은 Clerk 세션으로, 모바일 앱은 `Authorization: Bearer <연동 키>`로
인증합니다. 웹에서는 센서를 사용하지 않고 모바일 앱에서 업로드한 기록만
확인합니다. AirPods 센서 측정은 iPhone·iPad·macOS 앱에서만 실행됩니다.
자세 점수는 0~10 범위이며 5 미만은 주의 상태로 집계됩니다.

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
| `GATEWAY_API_KEY` | 오늘·로드맵·트레이너 | AI Gateway 키 |
| `SARAMIN_API_KEY` | 로드맵 | 사람인 Open API 키 |

선택 기능의 키가 없으면 해당 기능만 비활성화됩니다. 로그인과
`DATABASE_URL`은 계정별 데이터를 사용하기 위해 필요합니다.

### 사용하지 않는 Vercel/Neon 자동 생성 변수

`DATABASE_URL_UNPOOLED`, `PGHOST`, `PGUSER`, `PGPASSWORD`,
`POSTGRES_*`, `NEON_*`, `VERCEL_OIDC_TOKEN`, `VITE_NEON_AUTH_URL`은
현재 애플리케이션 코드에서 읽지 않습니다. Vercel이 연결 과정에서
자동 생성한 값은 배포 환경에 남아 있어도 되지만, 새로 작성하는
`.env`에는 추가하지 않습니다.

## 모바일 앱 실행

```bash
cd ../apps/PostureCoach
open PostureCoach.xcodeproj
```

Xcode에서:

1. `PostureCoach` 스킴: iPhone/iPad
2. `PostureCoachMac` 스킴: macOS
3. Signing & Capabilities에서 Apple Developer Team 선택
4. 실제 AirPods가 연결된 기기에서 실행
5. 앱 설정에 HTTPS API 주소와 `/posture`의 연동 키 입력

모바일 앱은 시뮬레이터에서 AirPods 센서를 측정할 수 없습니다.
TestFlight 배포 절차는 `../apps/PostureCoach/README.md`를 참고합니다.

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
