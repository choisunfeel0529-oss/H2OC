# H2OC (에이치투오씨) 계산기

분리배출한 폐기물의 무게를 입력하면 절감된 **탄소량**과 절약된 **수자원 비율**을 계산해주고,
참여자들의 랭킹을 보여주는 모바일 최적화 웹 서비스입니다.

## 1. 완성된 기능

- **메인 화면** (`/`) — 서비스 로고, "계산하러 가기" / "내 랭킹 보러 가기" 메뉴
- **닉네임 입력** (`/login`) — 서버(D1) 대상 중복 검사, 최근 닉네임 자동완성
- **폐기물 선택** (`/select`) — 6종 폐기물(PP/HDPE/PET/LDPE/종이/캔) 카드 선택
- **무게 입력** (`/weight`) — g 단위 입력, 폐기물 종류별 안내 문구
- **결과 화면** (`/result`) — 탄소 저감량(kg), 수자원 절약률(%) + 공유하기(Web Share API/클립보드)
- **랭킹 화면** (`/ranking`) — 전체 참여자 수·누적 탄소·평균 수자원 절약률, 내 랭킹 하이라이트, TOP100(금/은/동 배지)
- **관리자 화면** (`/admin`) — 전체 데이터 표 조회, 닉네임/폐기물 필터, 페이지네이션, CSV 다운로드, 레코드 삭제
- **데이터는 Cloudflare D1(SQLite)에 영구 저장**되어 랭킹/통계에 실시간 반영됩니다.

## 2. URL / API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/`, `/login`, `/select`, `/weight`, `/result`, `/ranking`, `/admin` | 화면 페이지 |
| GET | `/api/waste-types` | 폐기물 종류/계수 목록 |
| GET | `/api/nickname-check?nickname=` | 닉네임 중복 확인 |
| POST | `/api/submissions` `{nickname, waste_type, weight_g}` | 계산 + 저장 |
| GET | `/api/submissions?page=&limit=&nickname=&waste_type=` | 전체 목록 (관리자용) |
| DELETE | `/api/submissions/:id` | 레코드 삭제 (관리자용) |
| GET | `/api/ranking?limit=100` | 요약 통계 + TOP N 랭킹 |
| GET | `/api/ranking/me?nickname=` | 특정 닉네임의 순위 |

※ 페이지는 `.html` 확장자 없이 접근합니다 (Cloudflare Pages 정적 자산 정규화와의 충돌을 피하기 위해 워커에서 직접 서빙).

## 3. 데이터 모델 (Cloudflare D1)

**테이블**: `submissions` (`migrations/0001_initial_schema.sql`)

| 필드 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | UUID |
| nickname | TEXT | 참여자 닉네임 (서버에서 중복 검사) |
| waste_type | TEXT | pp/hdpe/pet/ldpe/paper/can |
| waste_label | TEXT | 표시명 |
| weight_g | REAL | 입력 무게(g) |
| carbon_kg | REAL | 서버에서 재계산한 탄소 저감량 |
| water_percent | REAL | 서버에서 재계산한 수자원 절약률 |
| created_at / updated_at | DATETIME | 생성/수정 시각 |

계산 계수는 `src/index.tsx`의 `WASTE_TYPES`에서 관리하며, **모든 계산과 닉네임 중복 검사는
서버(Worker)에서 최종 검증**합니다 (클라이언트 계산은 미리보기 용도).

## 4. 로컬 개발

```bash
npm run build
pm2 start ecosystem.config.cjs   # wrangler pages dev --local (D1 로컬 SQLite 자동 사용)

# D1 관리
npm run db:migrate:local   # 로컬 마이그레이션 적용
npm run db:seed            # 샘플 데이터 삽입
npm run db:console:local   # SQL 직접 실행
```

## 5. 배포 (Cloudflare Pages + D1)

1. `npx wrangler d1 create h2oc-calculator-production` 실행 후 반환된 `database_id`를
   `wrangler.jsonc`의 `d1_databases[0].database_id`에 반영
2. `npm run db:migrate:prod` 로 운영 DB에 스키마 적용
3. `npm run build && npx wrangler pages deploy dist --project-name h2oc-calculator`

## 6. 아직 구현되지 않은 기능 / 제한사항

- **계산 기준 데이터 출처**: 현재 데모용 계수 사용 중 (탄소/수자원 계수 공인 자료 교체 필요)
- **관리자 페이지 접근 제어**: 현재 URL(`/admin`)만 알면 누구나 접근 가능. 운영 시 Hosted 배포의
  라우트 접근 규칙(허용된 이메일/인증된 사용자만 등)으로 보호 권장
- **SNS 공유 OG 이미지/메타태그**: 기본 Web Share API/클립보드 복사만 구현
- **동일 닉네임 재제출**: 현재는 닉네임당 최초 1회만 허용(서버에서 중복 거부). 여러 번 제출해
  누적시키는 정책으로 바꾸려면 `POST /api/submissions`의 중복 검사 로직 조정 필요

## 7. 추천 다음 단계

1. 실제 환경부/재활용 공인 데이터로 `WASTE_TYPES` 계수 업데이트
2. `/admin` 라우트 접근 제한 설정 (Hosted 배포 시 접근 규칙 적용)
3. 종료 시점이 정해져 있다면 종료 안내 배너/잠금 기능 추가
4. QR 코드 생성 (팝업스토어 배포용 최종 URL 확정 후)

## 8. 기술 스택

- Hono (Cloudflare Workers) + TypeScript
- Cloudflare D1 (SQLite) — `submissions` 테이블
- Vanilla JS (프론트, `/static/data.js`) — CDN 의존성 없음
- Google Fonts: Black Han Sans(제목), Noto Sans KR(본문)

## 9. 파일 구조

```
src/index.tsx           Hono 백엔드 + API + 페이지 라우트(raw HTML import)
migrations/              D1 마이그레이션 SQL
seed.sql                 샘플 데이터
public/
  index.html, login.html, select.html, weight.html,
  result.html, ranking.html, admin.html
  static/style.css       공통 스타일
  static/data.js         계산 로직 + API 연동 클라이언트 함수
  static/images/paper-bg.jpg  배경 이미지
```

## 10. 배포 상태

- **환경**: 샌드박스 로컬 개발 (Cloudflare D1 `--local` 모드로 동작 확인 완료)
- **다음 단계**: 사용자가 Cloudflare 배포를 요청하면 위 "5. 배포" 절차대로 진행
