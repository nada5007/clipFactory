# CLAUDE.md — Claude Code 작업 지침

이 파일은 Claude Code가 이 저장소에서 작업할 때 항상 따르는 규칙이다.
요구사항의 원본은 `PROJECT_SPEC.md`이며, 충돌 시 PROJECT_SPEC.md가 우선한다.

## 프로젝트 요약

YouTube 쇼츠 제작·관리 도구. 두 개의 큰 모듈로 구성된다.
1. **studio**: 비디오 프로젝트 생성/관리 + 스크립트→이미지→TTS→렌더링→업로드 파이프라인
2. **insight**: YouTube 데이터 분석 대시보드 (탐색, 채널 분석, 떡상 영상, 영상 SEO 등)

## 기술 스택 (고정)

- Next.js 14+ App Router, TypeScript strict 모드, Tailwind CSS, shadcn/ui
- Prisma + SQLite (개발), 마이그레이션은 `prisma migrate dev` 사용
- 영상 처리: FFmpeg (child_process 호출은 `src/lib/ffmpeg.ts` 한 곳에서만)
- 외부 API 클라이언트는 `src/lib/clients/` 아래에 모듈별로 격리
  (anthropic.ts, youtube.ts, tts.ts, image.ts — 다른 곳에서 fetch 직접 호출 금지)

## 디렉터리 구조

```
src/
  app/
    (studio)/projects/          # 기능 1 화면
    (insight)/analytics/        # 기능 2 화면
    api/                        # API Routes
  components/                   # 공용 UI
  lib/
    clients/                    # 외부 API 클라이언트
    cache.ts                    # API 응답 캐싱 (TTL)
    quota.ts                    # YouTube 쿼터 추적
    ffmpeg.ts
  server/
    services/                   # 비즈니스 로직 (라우트 핸들러는 얇게)
    pipeline/                   # 파이프라인 단계별 모듈 (script, image, tts, render, upload)
prisma/
storage/                        # 생성 산출물 (git ignore)
```

## 코딩 규칙

1. API Route 핸들러에는 로직을 두지 않는다. `server/services/`의 서비스 함수를 호출만 한다.
2. 모든 외부 API 호출은 캐싱 레이어(`lib/cache.ts`)를 통과해야 한다. YouTube search.list는 특히 비싸다(100 units) — 동일 파라미터 1시간 캐시.
3. 장시간 작업(렌더링, 일괄 이미지 생성)은 요청-응답으로 처리하지 말고 작업 레코드 생성 → 비동기 실행 → SSE(`/api/projects/:id/events`)로 진행률 전송.
4. 환경변수는 `src/env.ts`에서 zod로 검증 후 사용. `process.env` 직접 접근 금지.
5. 에러는 삼키지 않는다. 파이프라인 단계 실패 시 Project.status=FAILED + errorMessage 저장.
6. UI 텍스트는 한국어. 코드 식별자/주석은 영어.
7. 시크릿(.env)은 절대 커밋하지 않는다. `.env.example`만 유지.

## 작업 방식

- 모든 진행 결과 표출(응답 메시지, 요약, 상태 보고) 및 문서기록(Task.md, agent_trace.md 등)은 한글을 사용한다.
- **사용자가 기능 추가·수정을 요청하면, 구현에 착수하기 전에 그 요청 사항을 반드시 PROJECT_SPEC.md의 관련 섹션에 먼저 기재한다.** (예: 2.3 핵심 로직 상세에 날짜와 함께 변경 이력 형태로 추가). 구현 후에만 기재하거나 기재를 생략하지 않는다 — PROJECT_SPEC.md가 항상 요구사항의 최신 원본을 반영하도록 유지하기 위함이다.
- 새 기능 착수 전 PROJECT_SPEC.md의 해당 섹션을 읽고, 계획을 짧게 제시한 뒤 구현한다.
- 한 번에 하나의 Phase 항목만 진행한다. 스코프를 임의로 확장하지 않는다.
- 스키마 변경 시: schema.prisma 수정 → migrate → 영향받는 서비스/타입 함께 수정.
- 각 파이프라인 단계는 단독 실행 가능한 함수로 작성하고, 최소 1개의 단위 테스트를 붙인다 (vitest).
- TikTok/Instagram/Douyin/Kuaishou 관련 요청이 있어도 스크래핑 코드는 작성하지 않는다. 어댑터 인터페이스만 정의한다.

## 자주 쓰는 명령

```
npm run dev            # 개발 서버
npx prisma studio      # DB 브라우저
npm run test           # vitest
npm run lint && npm run typecheck
```
