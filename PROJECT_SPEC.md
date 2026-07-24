# YouTube 콘텐츠 스튜디오 — 프로젝트 명세서 (PROJECT_SPEC.md)

> reelbox.ai의 핵심 기능 2가지를 로컬 개발 환경(VS Code + Claude Code)에서 직접 구현하는 프로젝트.
> 이 문서는 Claude Code가 참조하는 최상위 요구사항 문서이며, 세부 구현 지침은 CLAUDE.md를 참조한다.

---

## 0. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | youtube-content-studio (가칭) |
| 목표 | ① YouTube 비디오 프로젝트 생성·관리 시스템 ② YouTube 데이터 분석 대시보드 |
| 개발 도구 | VS Code + Claude Code |
| 사용자 | 단일 사용자(본인) 우선. 멀티유저는 추후 확장 |
| 배포 | 1차: 로컬 실행 (localhost) / 2차: 개인 서버 또는 Vercel 배포 |

### 0.1 권장 기술 스택

```
Frontend  : Next.js 14+ (App Router) + TypeScript + Tailwind CSS + shadcn/ui
Backend   : Next.js API Routes (또는 대안: Spring Boot 3 + React 분리형)
DB        : SQLite (개발) → PostgreSQL (운영), ORM: Prisma
작업 큐    : BullMQ + Redis (영상 생성 등 장시간 작업용) — 1차에서는 단순 비동기 처리로 대체 가능
영상 처리  : FFmpeg (로컬 설치 필수)
외부 API  : Anthropic API(스크립트), TTS API(ElevenLabs 또는 Google Cloud TTS),
            이미지 생성 API(택 1), YouTube Data API v3
```

> Java/Spring 경험이 있다면 Backend를 Spring Boot(WebFlux 또는 MVC + SSE)로 분리해도 좋다.
> 단, 1인 개발 + Claude Code 활용 효율을 고려하면 Next.js 단일 코드베이스를 권장한다.

### 0.2 필요한 API 키 (.env)

```
ANTHROPIC_API_KEY=        # 스크립트/아이디어 생성
ELEVENLABS_API_KEY=       # TTS (또는 GOOGLE_TTS_KEY)
IMAGE_API_KEY=            # 이미지 생성 (예: 별도 이미지 생성 API)
YOUTUBE_API_KEY=          # Data API v3 (분석용, 읽기)
GOOGLE_OAUTH_CLIENT_ID=   # YouTube 업로드용 OAuth 2.0
GOOGLE_OAUTH_CLIENT_SECRET=
DATABASE_URL=
```

---

## 1. 기능 1 — YouTube 비디오 프로젝트 생성 및 관리

### 1.1 데이터 모델

```prisma
model Channel {
  id            String    @id @default(cuid())
  name          String
  youtubeChannelId String?           // 연동된 실제 YouTube 채널
  defaultSettings Json                // 스크립트/TTS/영상/업로드 기본값
  projects      Project[]
  createdAt     DateTime  @default(now())
}

model Project {
  id            String    @id @default(cuid())
  title         String
  description   String?
  channelId     String
  channel       Channel   @relation(fields: [channelId], references: [id])
  status        ProjectStatus @default(DRAFT)
  // DRAFT | SCRIPTING | IMAGING | TTS | EDITING | RENDERED | UPLOADED | FAILED
  reviewStatus  ReviewStatus  @default(PENDING)   // PENDING | REVIEWED
  creationType  CreationType  @default(MANUAL)    // MANUAL | AI_AUTO
  progress      Int       @default(0)             // 0~100
  settings      Json                              // 채널 기본값 override
  script        Script?
  images        ImageAsset[]
  audio         AudioAsset?
  video         VideoAsset?
  thumbnail     ThumbnailAsset?
  uploadConfig  UploadConfig?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

(Script, ImageAsset, AudioAsset, VideoAsset, ThumbnailAsset, UploadConfig 모델은
각각 원본 텍스트/파일 경로/생성 파라미터/상태 필드를 갖는다 — 구현 시 Claude Code가 상세 설계)

### 1.2 프로젝트 관리 화면 (목록)

**요구사항**

1. **프로젝트 생성**
   - 우측 상단 `+ 새 프로젝트` 버튼 → 모달 오픈
   - 필수 입력: 채널 선택(드롭다운), 제목
   - 선택 입력: 설명, 생성 방식(수동/AI 자동)
   - 생성 시 채널의 `defaultSettings`가 프로젝트 `settings`로 복사됨 (이후 프로젝트에서 수정하면 프로젝트 값이 최종 적용)

2. **검색 및 필터**
   - 검색: 프로젝트 제목 부분 일치 (디바운스 300ms)
   - 필터 드롭다운 3종: 채널 / 상태(status) / 생성 방식(creationType)
   - 정렬: 최신순(기본), 오래된순, 제목순, 진행률순
   - 검색·필터·정렬 상태는 URL 쿼리스트링에 반영 (새로고침 유지)

3. **프로젝트 카드 리스트**
   - 카드에 표시: 제목, 채널명, 진행률 바(%), 상태 뱃지, 검수 상태, 생성일
   - 카드 우측 상단 `⁝` 메뉴: 프로젝트 수정(제목/설명 인라인 수정 모달), 복제, 삭제(확인 다이얼로그)
   - **검수 완료 체크박스**: 클릭 시 reviewStatus를 PENDING ↔ REVIEWED 토글. 목록에서 검수 대기/완료를 시각적으로 구분 (뱃지 색상)
   - **작업 계속 버튼**: 프로젝트 상세 편집 화면으로 이동

### 1.3 프로젝트 상세 편집 화면

좌측 사이드바 탭 6개 + 우측 미리보기 영역 구조.

| 탭 | 기능 | 1차 범위 |
|---|---|---|
| 스크립트 설정 | 주제 입력 → Anthropic API로 쇼츠 대본 생성. 톤/길이/언어 옵션. 수동 편집 가능 | ✅ 필수 |
| 이미지 생성 | 대본 장면별 이미지 프롬프트 자동 생성 → 이미지 API 호출. 장면별 재생성/교체 | ✅ 필수 |
| TTS/BGM 설정 | 대본 → TTS 음성 파일 생성 (한국어 자연 음성). BGM 파일 선택 + 볼륨 조절 | ✅ 필수 |
| 영상 설정 | FFmpeg로 이미지+음성+자막(SRT 자동 생성)+BGM 합성. 해상도(1080x1920), 자막 스타일 | ✅ 필수 |
| 썸네일 설정 | 이미지 선택 또는 생성 + 텍스트 오버레이 | ⏩ 2차 |
| 업로드 설정 | 제목/설명/태그, 공개 설정, 예약 업로드(datetime), YouTube OAuth 업로드 | ✅ 필수 (예약은 2차) |

**파이프라인 규칙**
- 각 단계는 독립 실행 가능하되, 이전 단계 산출물이 없으면 안내 표시
- 단계 완료 시 `progress` 자동 갱신 (스크립트 20% → 이미지 40% → TTS 60% → 영상 80% → 업로드 100%)
- 장시간 작업(이미지 일괄 생성, 렌더링)은 백그라운드 작업 + 진행률 SSE(Server-Sent Events)로 클라이언트에 스트리밍

### 1.4 API 엔드포인트 (초안)

```
POST   /api/projects                  프로젝트 생성
GET    /api/projects?q=&channel=&status=&type=&sort=   목록+검색+필터
PATCH  /api/projects/:id              제목/설명/검수상태/설정 수정
DELETE /api/projects/:id
POST   /api/projects/:id/script       대본 생성 (Anthropic API)
POST   /api/projects/:id/images       장면별 이미지 생성
POST   /api/projects/:id/tts          TTS 생성
POST   /api/projects/:id/render       FFmpeg 렌더링 (비동기)
GET    /api/projects/:id/events       SSE 진행률 스트림
POST   /api/projects/:id/upload       YouTube 업로드 (OAuth)
GET    /api/channels                  채널 목록/기본값 관리
```

---

## 2. 기능 2 — YouTube 데이터 분석 대시보드

### 2.1 현실적 범위 설정 (중요)

reelbox는 YouTube + TikTok + Instagram + Douyin + Kuaishou 멀티플랫폼 검색을 제공하지만,
**TikTok/Instagram/Douyin/Kuaishou는 공개 검색 API가 사실상 없거나 매우 제한적**이다.
비공식 스크래핑은 각 플랫폼 약관 위반 소지가 있으므로 이 프로젝트에서는:

- **1차 범위: YouTube Data API v3 기반 기능만 구현** (아래 표에서 ✅)
- 타 플랫폼은 인터페이스만 설계해 두고(어댑터 패턴), 추후 합법적 서드파티 데이터 API를 붙일 수 있게 확장 포인트만 남긴다

또한 YouTube Data API는 **일일 쿼터 10,000 units** 제한이 있으므로(search.list는 1회 100 units),
모든 API 응답을 DB에 캐싱하고 TTL(예: 인기 영상 1시간, 채널 정보 24시간)을 두는 것이 필수다.

### 2.2 메뉴 구성 및 범위

| # | 메뉴 | 설명 | 범위 |
|---|---|---|---|
| 2.1 | 홈 | 오늘의 AI 아이디어(저장된 관심 키워드 기반 Anthropic API 생성) + 요약 위젯(내 채널 지표, 최근 떡상 영상) | ✅ 1차 |
| 2.2 | 소스 발굴 | 해외 YouTube 검색 (지역 코드 US/JP/글로벌 등 지정, 키워드/카테고리) | ✅ 1차 (YouTube만) |
| 2.3 | 쇼핑 소스 발굴 | 상품 영상(언박싱·리뷰·하울) 키워드 프리셋 검색 + 영상 설명에서 상품/링크 추출 + 쇼핑 쇼츠 아이디어 AI 생성 | ⏩ 2차 (YouTube만) |![alt text](image.png)
| 2.4 | 탐색·분석 | 지금 인기 영상(mostPopular, 지역·카테고리별) + 키워드 시장성(검색량 프록시: 검색 결과 수·평균 조회수·경쟁 채널 규모 분석) | ✅ 1차 |
| 2.5 | 채널 분석 | 채널 URL/ID 입력 → TOP 영상, 전체 영상 스캔(uploads 플레이리스트 페이지네이션), 업로드 시간대별 성과(골든시간 히트맵), 썸네일 그리드 분석 | ✅ 1차 |
| 2.6 | 한·영 비교 | 동일 카테고리의 KR vs US 인기 영상 나란히 비교 → "한국화 갭"(해외에서 뜨는데 한국에 없는 소재) AI 분석 | ⏩ 2차 |
| 2.7 | 제목 변경 이력 | 즐겨찾기 채널의 영상 제목을 주기적으로(cron) 스냅샷 → 제목 변경 감지 + 변경 전후 조회수 추이 비교 | ⏩ 2차 |
| 2.8 | 영상 SEO | 영상 URL 1개 입력 → 제목/설명/태그 SEO 진단, 댓글 수집·감성 요약(AI), 유사 영상 리스트 | ✅ 1차 |
| 2.9 | 떡상 영상 ⭐ | 키워드 검색 결과에서 채널 평균 조회수 대비 N배(기본 5배) 이상 폭증한 영상 필터링 | ✅ 1차 (핵심 기능) |
| 2.10 | 영상 분석 모달 | 모든 탭의 영상 카드 클릭 → 모달: 개요/통계/자막/댓글/SEO/유사영상/썸네일/채널정보/AI 아이디어 9탭 | ✅ 1차 (자막·댓글·AI아이디어 우선) |
| 2.11 | 저장됨 | 영상/채널/아이디어 스냅샷 저장(당시 지표 보존) + 저장 항목 기반 대본 생성 버튼 → 기능 1의 새 프로젝트로 연결 | ✅ 1차 |

### 2.3 핵심 로직 상세

**홈 (2.1) "오늘의 AI 아이디어" 직접 입력 모드 — UI 수정 요청 (2026-07-24 수정, 원본 서비스 스크린샷 기준)**
- 헤더 한 줄에 모드 토글(자동/직접 입력)과 `아이디어 생성` 버튼을 함께 배치한다 (버튼을 별도 줄에 분리하지 않는다).
- 직접 입력 모드는 옅은 배경으로 구분되는 박스 안에 다음을 배치한다:
  1. 안내 문구: "직접 주제·타깃·카테고리를 지정해 5개 아이디어를 받습니다 (저장된 자동 모드 결과는 그대로 유지됨)."
  2. `주제/제품` 입력 (placeholder 예: "다이어트 / 비트코인 ETF / 스탠리 텀블러")
  3. `타깃 시청자` 입력 (선택, placeholder 예: "30대 직장인 / 자취생")
  4. `카테고리` (선택, 1개 클릭) — 자유 텍스트 입력이 아니라 `없음` + 니치 카테고리 목록(16종, lib/niche-catalog.ts와 동일) 중 단일 선택 칩
- **자동/직접 입력 모드는 서로 다른 결과를 독립적으로 저장한다** — 안내 문구가 명시하듯 직접 입력으로 생성해도 그날의 자동 모드 결과가 사라지면 안 된다. 즉 "오늘의 아이디어" 저장 키는 날짜만이 아니라 (날짜, 모드) 조합이어야 한다 (기존 구현은 date만으로 upsert해 모드 전환 시 서로 덮어썼음 — 수정 필요).
- 크레딧 표시는 계속 범위 밖(§2.1 실비용 투명 표시 정책 유지) — 버튼 라벨에 크레딧 수치를 넣지 않는다.

**소스 발굴 (2.2) — UI 확장 요구사항 (2026-07-20 수정, 원본 서비스 스크린샷 기준)**
- 최초 구현은 컨셉 입력 + 지역 1개 선택 + 한국 콘텐츠 제외 토글만 있는 축소판이었으나,
  원본 서비스 스크린샷 확인 결과 아래 폼 요소로 확장한다 (UI_SPEC.md §7.1 "소스 발굴" 문서 내용과 일치):
  1. **지역 다중 선택** — 7그룹 칩: 영어권(미국/영국/캐나다/호주/뉴질랜드/아일랜드/싱가포르/인도),
     서유럽(독일/프랑스/네덜란드/벨기에/오스트리아/스위스/이탈리아/스페인/포르투갈),
     북유럽(스웨덴/노르웨이/덴마크/핀란드/아이슬란드),
     동유럽(폴란드/체코/헝가리/루마니아/그리스/우크라이나/러시아/튀르키예),
     아시아(일본/대만/홍콩/인도네시아/태국/베트남/말레이시아/필리핀),
     라틴아메리카(브라질/멕시코/아르헨티나/콜롬비아/칠레),
     중동·아프리카(UAE/사우디/이집트/이스라엘/남아공) — `전체 선택`/`전체 해제` 버튼 포함
  2. **언어 다중 선택 칩 15종** — 영어/일본어/중국어/스페인어/독일어/프랑스어/이탈리아어/포르투갈어/러시아어/폴란드어/튀르키예어/인도네시아어/태국어/베트남어/아랍어
  3. **길이 / 게시일 / 최소 조회수 / 정렬** 드롭다운 4종 (옵션값은 UI_SPEC.md §7.1 참고)
  4. **제목 자동 번역** 체크박스 (해외 영상 제목을 한글로 변환해 병기)
  5. **한국 콘텐츠 제외** 토글 (기본 ON, 기존 구현 유지)
- **범위 제외(변경 없음)**: TikTok·Instagram 플랫폼 검색, 크레딧 잔액/차감 UI는 계속 범위 밖 — 스크래핑 금지 방침(§2.1) 및 실비용 투명 표시 정책에 따라 YouTube Data API만 사용하고 비용은 크레딧이 아닌 실제 API 사용량으로 표시한다.
- 다중 지역·다중 언어 선택은 백엔드에서 지역별 병렬 검색 후 중복 제거·병합하는 방식으로 구현한다 (YouTube search.list는 다중 지역·언어를 한 번에 받지 않으므로).

**떡상 영상 (2.9) — 핵심 알고리즘**
```
1. 키워드로 search.list → 영상 목록 (최근 N일 필터)
2. videos.list로 각 영상 조회수 조회
3. 각 영상의 채널에 대해 channels.list → 채널 통계 + uploads 최근 30개 영상 평균 조회수 계산 (캐싱)
4. multiplier = 영상 조회수 / 채널 최근 평균 조회수
5. multiplier >= 임계값(기본 5배) 영상만 표시, 배수 순 정렬
6. 결과 캐싱 (동일 키워드 1시간)
```

**키워드 시장성 (2.4)**
- 검색 결과 상위 50개의 조회수 분포(중앙값/상위10%), 업로드 최신성, 참여율(좋아요/조회수), 경쟁 채널 구독자 분포를 종합해 0~100 스코어 산출
- 스코어 공식은 초기엔 단순 가중합, 대시보드에 근거 데이터 함께 표시

**영상 분석 모달 (2.10)**
- 자막: YouTube 자막 트랙 조회(가능한 경우) → 없으면 "자막 없음" 표시 (음성 STT는 범위 외)
- 댓글: commentThreads.list 상위 100개 → Anthropic API로 반응 요약/감성 분류
- AI 아이디어: 제목+자막+댓글 요약을 컨텍스트로 "이 소재로 만들 쇼츠 아이디어 5개" 생성 → 저장됨(2.11)으로 보관 가능

**저장됨 → 프로젝트 연결 (2.11, 두 기능의 연결 고리)**
- 저장된 아이디어/영상에서 `대본 생성` 클릭 → 기능 1의 새 프로젝트가 자동 생성되고 스크립트 설정 탭에 컨텍스트가 주입된 상태로 이동

### 2.4 데이터 모델 (분석용, 초안)

```
CachedVideo / CachedChannel   : API 응답 캐시 (TTL 필드 포함)
FavoriteChannel               : 즐겨찾기 채널 (제목 이력 추적 대상)
TitleSnapshot                 : videoId, title, viewCount, capturedAt
SavedItem                     : type(VIDEO|CHANNEL|IDEA), snapshotJson, note
KeywordAnalysis               : keyword, score, evidenceJson, analyzedAt
```

---

## 3. 개발 로드맵

### Phase 1 — 뼈대 (1~2주)
- [ ] Next.js + Prisma + SQLite 프로젝트 셋업, 레이아웃/네비게이션
- [ ] 기능 1: Channel/Project CRUD + 목록(검색·필터·정렬·검수상태) 완성
- [ ] YouTube Data API 클라이언트 + 캐싱 레이어

### Phase 2 — 파이프라인 (2~3주)
- [ ] 스크립트 생성(Anthropic API) → TTS → 이미지 → FFmpeg 렌더링 순서로 1단계씩
- [ ] SSE 진행률 스트리밍
- [ ] YouTube OAuth + 업로드

### Phase 3 — 분석 대시보드 (2~3주)
- [ ] 탐색·분석 / 채널 분석 / 떡상 영상 / 영상 SEO
- [ ] 영상 분석 모달 (자막·댓글·AI 아이디어)
- [ ] 저장됨 + 프로젝트 연결

### Phase 4 — 고도화
- [ ] 예약 업로드, 썸네일 편집기, 한·영 비교, 제목 변경 이력(cron), 쇼핑 소스
- [ ] PostgreSQL 전환, 배포

---

## 4. 비기능 요구사항

- **쿼터 관리**: YouTube API 호출량을 DB에 기록, 일일 사용량 대시보드 표시, 80% 도달 시 경고
- **비용 관리**: Anthropic/TTS/이미지 API 호출 건수·예상 비용 로깅
- **파일 저장**: 생성 산출물은 `./storage/{projectId}/` 하위에 저장, DB에는 경로만
- **에러 처리**: 파이프라인 각 단계 실패 시 status=FAILED + 에러 메시지 저장, 해당 단계만 재시도 가능
- **약관 준수**: 스크래핑 금지. 공식 API만 사용. YouTube 콘텐츠 정책(중복 콘텐츠) 관련 안내 문구를 업로드 화면에 표시
