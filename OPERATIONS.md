# 운영자 매뉴얼

## 1. 개발 서버 시작 / 중지 / 재시작

**시작**
```bash
npm run dev
```
기본적으로 http://localhost:3000 에서 실행된다.

**재시작이 필요한 경우**
- `.env`의 API 키(ANTHROPIC_API_KEY, GEMINI_API_KEY 등)를 새로 추가하거나 값을 바꿨을 때.
- `src/env.ts`가 프로세스 시작 시 `process.env`를 **한 번만** 읽어서 검증하기 때문에, 서버가 떠 있는 동안 `.env`를 고쳐도 즉시 반영되지 않는다. 채널 설정 > API 키 관리 화면에서 저장해도 마찬가지다(파일만 갱신되고, 실행 중인 프로세스는 재시작 전까지 이전 값을 그대로 쓴다).

**재시작 절차**
```bash
# 1. 3000번 포트를 쓰고 있는 프로세스 확인
lsof -i :3000

# 2. 해당 PID 종료 (응답 없으면 -9로 강제 종료)
kill <PID>
kill -9 <PID>   # 그래도 안 죽을 때만

# 3. 다시 시작
npm run dev
```
서버를 원래 실행했던 터미널이 남아있다면 그 창에서 Ctrl+C로 멈춘 뒤 `npm run dev`만 다시 실행해도 된다.

## 2. API 키 관리

- 위치: 채널 설정 > API 키 관리 (`/settings/api-keys`)
- 저장 시 `.env` 파일에 직접 기록된다.
- **저장 직후에는 반영되지 않는다** — 위 1번 절차로 재시작해야 실제로 그 키가 사용된다.
- `.env`를 에디터에서 직접 수정한 경우도 동일하게 재시작이 필요하다.

## 3. 데이터베이스

```bash
npx prisma studio      # 브라우저 DB 뷰어 (dev 서버와 별개 프로세스, 서버 재시작과 무관)
npx prisma migrate dev # 스키마(prisma/schema.prisma) 변경 후 마이그레이션 적용
```

## 4. 코드 품질 검증

```bash
npm run lint && npm run typecheck && npm run test
```

## 5. 배포 및 백업

현재는 별도의 원격 배포 파이프라인 없이 **로컬 머신에서 직접 실행**하는 것을 전제로 한다 (SQLite + 로컬 `storage/` 폴더 기반). 아래는 그 전제하의 절차다.

**로컬 프로덕션 모드로 실행**
```bash
npm run build   # .next에 프로덕션 빌드 생성
npm run start   # 빌드된 결과물 실행 (핫리로드 없음, .env는 실행 시점에 한 번 읽음)
```
`npm run dev`와 마찬가지로 `.env`는 프로세스 시작 시 한 번만 읽으므로, 키를 바꾸면 `npm run start`를 다시 실행해야 한다.

**백업 대상 3가지**
| 대상 | 경로 | 비고 |
|---|---|---|
| 데이터베이스 | `prisma/dev.db` | 채널/프로젝트/스크립트 등 전체 데이터가 담긴 SQLite 파일 하나 |
| 생성 산출물 | `storage/` | 이미지·TTS·영상·썸네일 등 실제 미디어 파일 (git ignore 대상이라 저장소에는 없음) |
| 환경변수 | `.env` | API 키 등 민감정보 — 백업본은 저장소가 아닌 별도의 안전한 위치(암호화된 볼륨 등)에 보관 |

**백업 절차**
```bash
# 1. 서버를 먼저 중지한다 (SQLite 파일을 실행 중에 복사하면 손상 위험)
lsof -i :3000        # PID 확인 후 kill

# 2. 세 대상을 통째로 복사해둔다
cp prisma/dev.db      /path/to/backup/dev.db.bak
cp -r storage/        /path/to/backup/storage.bak
cp .env               /path/to/backup/env.bak   # 별도 안전한 위치에 보관

# 3. 서버 재시작
npm run dev
```

**복원 절차**
```bash
# 1. 서버 중지
# 2. 백업본을 원래 경로로 되돌린다
cp /path/to/backup/dev.db.bak   prisma/dev.db
cp -r /path/to/backup/storage.bak/*  storage/
cp /path/to/backup/env.bak      .env

# 3. 서버 시작 (schema.prisma가 백업 시점 이후 바뀌었다면 먼저 마이그레이션 적용)
npx prisma migrate dev
npm run dev
```

## 6. 문제 해결

| 증상 | 조치 |
|---|---|
| "포트 3000이 이미 사용 중" 에러 | 1번 절차대로 기존 프로세스를 찾아 종료한 뒤 재시작 |
| API 키를 새로 등록했는데 여전히 "설정되지 않았습니다" 에러 | 재시작을 안 했을 가능성이 높음 — 1번 절차 수행 |
| 화면이 예전 상태로 보임 (코드는 수정됨) | 대부분 핫리로드로 자동 반영되지만, 반영 안 되면 재시작 |
