# late-to-work

지각 위기의 아침을 위한 출퇴근 추천 서비스. **카카오톡 채널 챗봇**으로 동작하며, 사용자는 "지각이야" 버튼 한 번으로 집-출근지 간 대중교통·택시 비교표와 한 줄 결론, 행동 안내를 받는다.

## 작동 방식

```
사용자 채팅방
  │
  ├─ "지각이야" 버튼 (또는 온보딩)
  │
  ▼
Kakao i 오픈빌더 (웹훅)
  │
  ▼
Python 백엔드 (Koyeb / Render 배포 예정)
  │
  ├─ 프로필 조회 (Firebase DB) ── 집/출근지/목표시각/선호
  ├─ [BETA] 대중교통 소요시간 (ODsay / TAGO / Kakao)
  ├─ [BETA] 택시 ETA + 요금 (Tmap)
  ├─ [BETA] 날씨 (KMA 초단기예보)
  │
  ▼
비교표 JSON
  │
  ▼
카카오톡 메시지 (버튼/카드 등)
```

## 프로젝트 구성 (이 레포지토리)

이 레포지토리는 **카카오톡 챗봇의 웹훅을 받는 Next.js 백엔드**다. 프론트(/page)는 개발/테스트용 웹 UI이며, 실제 서비스의 주 진입점은 `/api/*` 라우트다.

### API 라우트

| 라우트 | 역할 |
|--------|------|
| `POST /api/recommend` | 아침 재추천 (대중교통 vs 택시 비교표 + 한 줄 결론 + 행동). 서버 시각 기준. KMA 날씨 포함. |
| `POST /api/night-before` | 전날 밤 추천 (타이트/여유 출발 시각 2안) |
| `POST /api/address-search` | 주소/장소 검색 (카카오 맵 키워드·주소검색) |
| `POST /api/transit` | 대중교통 경로 (ODsay / TAGO / Kakao) |
| `POST /api/taxi` | 택시 경로/ETA (Tmap / Navi) |
| `POST /api/profile` | 사용자 프로필 저장/조회 |
| `GET /api/health` | 헬스체크 |

### 사용 중인 외부 API (키 환경변수 이름)

| 서비스 | 용도 | 환경변수 |
|--------|------|----------|
| Kakao REST API | 주소/장소 검색 | `KAKAO_REST_API_KEY` |
| Tmap | 차량 경로 · 택시 ETA · 요금 | `TMAP_APP_KEY` |
| ODsay | 대중교통 통합 길찾기 | `ODSAY_API_KEY` |
| TAGO 버스 | 버스 정류소·노선 | `TAGO_BUS_KEY` |
| TAGO 지하철 | 지하철 역·노선별 정보 | `TAGO_SUBWAY_KEY` |
| KMA 초단기예보 | 현재 날씨(강수 여부) | `KMA_WEATHER_KEY` |
| Upstage (사용 시) | AI 보조 기능 | `UPSTAGE_API_KEY` |

> **키는 절대 코드·로그·응답·README에 노출하지 않는다.** `.env.local`에 실제 값을 넣고 `.gitignore`로 제외한다. `.env.example`에는 키 이름만 기재한다.

### KMA 초단기예보 (날씨) 동작 방식

- KMA 오픈API `getUltraSrtFcst` 사용.
- 발표 시각 규칙: 매시각 30분 단위(base_time = 0000, 0030, 0100, 0130 ...). 발표 시각 + 45분 이후에 해당 발표 데이터 사용 가능.
- `src/lib/api/kma.ts`는 현재 시각(KST) 기준으로 base_time을 계산하고, 데이터가 없으면 30분 전 발표시각으로 재시도한다(max 24회). 이로써 당일 데이터 제공 범위 내 가장 이른 발표시각(통상 06:30경)의 데이터를 가져온다.
- 응답에서 강수 유무(PTY)를 읽어 `isRaining` / `note`로 반환한다.

## 기술 스택

- **Next.js 16.3.5** (App Router, 서버 컴포넌트 + API 라우트)
- **React 19.2.8**
- **TypeScript 5**
- **Tailwind CSS v4** + **@tailwindcss/postcss** (PostCSS 플러그인)
- **@heroui/react 3.2.5** / **@heroui/styles 3.2.5** — React Aria 기반 접근성 컴포넌트. Provider 불필요, CSS 임포트로 사용.
- **ESLint** (Next.js 전용 설정)

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. .env.local 파일 생성 (아래 .env.example 참고)
cp .env.example .env.local
# → 각 키에 실제 값을 넣는다 (값은 절대 커밋 금지)

# 3. 개발 서버
npm run dev
# → http://localhost:3000
```

### `.env.local` 예시 (값 없이 이름만)

```bash
KAKAO_REST_API_KEY=
TMAP_APP_KEY=
ODSAY_API_KEY=
TAGO_BUS_KEY=
TAGO_SUBWAY_KEY=
KMA_WEATHER_KEY=
UPSTAGE_API_KEY=
```

실제 값은 각 서비스 발급처에서 받아 넣는다. 키는 환경변수로만 읽고, 코드·로그·응답·문서에 값 자체를 쓰지 않는다.

## 빌드 확인

```bash
npm run build
```

- `next build`가 TypeScript 타입 체크와 함께 성공해야 한다.
- HeroUI 스타일(`@import "@heroui/styles"`)이 Tailwind v4(`@import "tailwindcss"`) 뒤에 오는 순서가 지켜져야 한다(`src/app/globals.css`).

## API 테스트 (로컬)

개발 서버를 띄운 뒤 `curl`로 `/api/recommend`를 호출하고 응답에 `weather`가 포함되는지 확인한다.

```bash
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"startX":127.061731,"startY":37.501478,"endX":127.030748,"endY":37.500723,"targetArrival":"09:00","sharedPrepMinutes":5,"taxiCallAddOn":false,"taxiCallAddMinutes":0}'
```

정상 응답 예: `result.weather = { isRaining: false, note: "현재 강수 없음" }`

## 배포 (Vercel)

1. GitHub에 푸시한다 (`kyu1c/late-to-work`).
2. Vercel에서 이 레포지토리를 연결한다.
3. Vercel 프로젝트 **Settings → Environment Variables**에 위 환경변수들을 등록한다(.env.local 대신 Vercel 대시보드 값 사용).
4. 배포 후 `/api/health` 또는 `/api/recommend`를 호출해 키가 정상 주입되는지 확인한다.

> `.env.local`은 Vercel 배포에 사용되지 않는다. 로컬 테스트용이며 gitignore 대상이다.

## 봇 연동 (카카오 i 오픈빌더)

- 오픈빌더 웹훅 URL = 배포된 `/api/recommend` (또는 상황에 맞는 라우트).
- 사용자 발화/버튼 → 웹훅 → 서버 계산 → 카카오톡 응답.
- 택시 호출·지도 연결 등 딥링크 기능은 카카오T/지도 앱 정책 공식 확인 후 반영한다(초기엔 버튼 웹 링크 + 웹 URL로 시작).

## 프로젝트 구조

```
late-to-work/
├── src/
│   ├── app/
│   │   ├── page.tsx            # 개발용 메인 UI ('use client')
│   │   ├── globals.css         # Tailwind v4 + HeroUI 스타일 + 프로젝트 CSS 변수
│   │   ├── layout.tsx          # 루트 레이아웃 (Geist 폰트)
│   │   └── api/                # API 라우트
│   │       ├── recommend/
│   │       ├── night-before/
│   │       ├── address-search/
│   │       ├── transit/
│   │       ├── taxi/
│   │       ├── profile/
│   │       └── health/
│   ├── lib/
│   │   ├── api/                # 외부 API 클라이언트
│   │   │   ├── kma.ts          # KMA 초단기예보
│   │   │   ├── tmap.ts         # Tmap
│   │   │   ├── odsay.ts        # ODsay
│   │   │   ├── tago.ts         # TAGO 버스/지하철
│   │   │   ├── kakao.ts        # 카카오 주소검색
│   │   │   ├── navi.ts         # 카카오내비 차량 경로
│   │   │   └── http.ts         # 공통 HTTP 헬퍼 (jsonRequest, getJson, postJson, classifyFailure)
│   │   ├── config.ts           # 환경변수 로딩 헬퍼 (requireEnv, hasEnv, EnvKeys)
│   │   ├── types.ts            # 공통 타입 (Profile, TransitResult, TaxiResult 등)
│   │   ├── calc/calcTrip.ts    # 비교 계산 로직
│   │   ├── transitChain.ts     # 대중교통 체인
│   │   └── taxiChain.ts        # 택시 체인
│   └── ...
├── .env.example                # 키 이름만 (커밋 대상)
├── .env.local                  # 실제 키 (gitignore)
├── .gitignore
├── postcss.config.mjs          # Tailwind v4 PostCSS
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 문서

- `.env.example` — 환경변수 이름 목록
- 이 README — 프로젝트 개요 + API + 개발/배포 방법

## 주의사항

- **API 키 보안**: 키 값은 코드, 로그, API 응답, 문서에 절대 작성하지 않는다. 환경변수 이름만 문서화한다.
- **KMA 날씨 재시도**: 현재 시각 기준 데이터가 없으면 이전 발표시각으로 자동 재시도하므로, 호출 시마다 결과가 달라질 수 있다.
- **디자인 시스템 확장**: HeroUI 기반 컴포넌트를 page.tsx 및 향후챗봇 웹훅 응답 화면(개발용)에 확대 적용할 수 있다. 추가 기능 구현 시 컴포넌트 단위로 작업한다.

## 라이선스

이 프로젝트의 라이선스는 별도 지정이 없는 한 공개되지 않는다. 외부 API 이용 시 각 서비스 약관을 따른다.
