# H2OC (에이치투오씨) 계산기

분리배출한 폐기물의 무게를 입력하면 절감된 **탄소량**과 절약된 **수자원 비율**을 계산해주고,
참여자들의 랭킹을 보여주는 모바일 최적화 웹 서비스입니다.

## 1. 완성된 기능

- **메인 화면** (`/`) — 서비스 로고, "계산하러 가기" / "내 랭킹 보러 가기" 메뉴
- **닉네임 입력** (`/login`) — 서버(D1) 대상 중복 검사, 최근 닉네임 자동완성,
  **동일 디바이스 재접속 시 기존 닉네임 자동 재사용**(입력창 스킵)
- **폐기물 선택** (`/select`) — D1 `waste_types` 테이블(엑셀 업로드로 관리)에서 실시간 조회한
  폐기물 카드 선택
- **무게 입력** (`/weight`) — g 단위 입력, 폐기물 종류별 안내 문구(DB 연동)
- **결과 화면** (`/result`) — 탄소 저감량(kg), 수자원 절약률(%/텍스트) +
  **인스타그램 스토리(9:16) 형식 이미지 생성/저장/공유 기능**
- **랭킹 화면** (`/ranking`) — 전체 참여자 수·누적 탄소·평균 수자원 절약률, 내 랭킹 하이라이트, TOP100(금/은/동 배지)
- **관리자 화면** (`/admin`) — **비밀번호 로그인 화면이 먼저 표시**되며, 인증 후에만
  전체 데이터 표 조회, 닉네임/폐기물 필터, 페이지네이션, CSV 다운로드, 레코드 삭제,
  **계산 데이터 엑셀 업로드**(헤더명 기준 매핑) 가능
- **계산 데이터는 관리자가 업로드한 엑셀 파일(`waste_types` 테이블) 기준으로 자동 계산**되며,
  엑셀에 행이 추가/변경되어도 재업로드 시 즉시 반영됩니다.
- **데이터는 Cloudflare D1(SQLite)에 영구 저장**되어 랭킹/통계에 실시간 반영됩니다.

## 2. URL / API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/`, `/login`, `/select`, `/weight`, `/result`, `/ranking`, `/admin` | 화면 페이지 | - |
| GET | `/api/waste-types` | 폐기물 종류/계수 목록 (엑셀 업로드 데이터) | 공개 |
| GET | `/api/nickname-check?nickname=&device_id=` | 닉네임 중복 확인 (동일 device_id는 재사용 허용) | 공개 |
| GET | `/api/device-nickname?device_id=` | 이 디바이스가 이전에 쓴 닉네임 조회 | 공개 |
| POST | `/api/submissions` `{nickname, waste_type, weight_g, device_id}` | 계산 + 저장 | 공개 |
| GET | `/api/submissions?page=&limit=&nickname=&waste_type=` | 전체 목록 | 관리자 |
| DELETE | `/api/submissions/:id` | 레코드 삭제 | 관리자 |
| GET | `/api/ranking?limit=100` | 요약 통계 + TOP N 랭킹 | 공개 |
| GET | `/api/ranking/me?nickname=` | 특정 닉네임의 순위 | 공개 |
| POST | `/api/admin/login` `{password}` | 관리자 로그인 (서명 쿠키 발급, 12시간) | - |
| POST | `/api/admin/logout` | 관리자 로그아웃 | - |
| GET | `/api/admin/check` | 현재 세션 인증 여부 확인 | - |
| POST | `/api/admin/waste-types/upload` (multipart, field `file`) | 계산 데이터 엑셀 업로드 (헤더명 매핑, 1행 헤더/2행~ 데이터) | 관리자 |
| GET | `/api/admin/waste-types` | 현재 등록된 계산 데이터 조회 | 관리자 |

※ 페이지는 `.html` 확장자 없이 접근합니다 (Cloudflare Pages 정적 자산 정규화와의 충돌을 피하기 위해 워커에서 직접 서빙).

## 3. 데이터 모델 (Cloudflare D1)

**테이블 1**: `waste_types` (`migrations/0002_waste_types_and_device.sql`) — 계산 데이터 엑셀의 최신 상태

| 필드 | 타입 | 설명 |
|---|---|---|
| id | INTEGER PK | 자동 증가 |
| code | TEXT UNIQUE | 폐기물 코드 (seed: pp/hdpe/pet/ldpe/paper/can, 업로드 시 item_N) |
| item_name | TEXT | 엑셀 "품목" 컬럼 |
| carbon_factor | REAL | 엑셀 "탄소 절감 계수" 컬럼 |
| water_percent | REAL (nullable) | 엑셀 "수자원 절감률(%)" 숫자 값 |
| water_label | TEXT (nullable) | water_percent가 숫자가 아닐 때(예: "신재 대비 대폭 절감") 대체 텍스트 |
| sort_order | INTEGER | 화면 표시 순서 (엑셀 행 순서) |

**테이블 2**: `submissions` (`migrations/0001_initial_schema.sql` + `0002`/`0003`로 컬럼 추가/조정)

| 필드 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | UUID |
| nickname | TEXT | 참여자 닉네임 (서버에서 중복 검사, 동일 device_id는 예외) |
| waste_type | TEXT | waste_types.code 참조 |
| waste_label | TEXT | 표시명 |
| weight_g | REAL | 입력 무게(g) |
| carbon_kg | REAL | 서버에서 재계산한 탄소 저감량 |
| water_percent | REAL (nullable) | 서버에서 재계산한 수자원 절약률 (0003에서 nullable로 수정) |
| water_label | TEXT (nullable) | 텍스트형 수자원 표시값 |
| device_id | TEXT (nullable) | 제출한 디바이스 식별자(localStorage UUID) |
| created_at / updated_at | DATETIME | 생성/수정 시각 |

계산 계수는 **관리자 페이지에서 업로드한 엑셀 파일 → `waste_types` 테이블**에서 관리하며(하드코딩 제거),
**모든 계산과 닉네임 중복 검사는 서버(Worker)에서 최종 검증**합니다.

### 엑셀 업로드 매핑 규칙
- 1행 = 헤더(컬럼명), 2행부터 마지막 행까지 = 실제 데이터로 처리
- 컬럼 위치가 아닌 **헤더명**으로 매핑 (`품목`, `탄소 절감 계수`, `수자원 절감률(%)`)
- 새로운 데이터 행이 추가되어도 업로드 시 자동으로 모두 인식(행 수 제한 없음)
- 업로드 시 기존 `waste_types` 데이터는 새 엑셀 내용으로 전체 교체됩니다.

## 4. 관리자 인증

- `/admin` 접속 시 비밀번호 입력 화면이 먼저 표시됩니다.
- 비밀번호는 환경변수 `ADMIN_PASSWORD`로 설정(로컬: `.dev.vars`, 운영: `wrangler pages secret put ADMIN_PASSWORD`).
  미설정 시 기본값 `h2oc2026!` 사용(운영 배포 전 반드시 변경 권장).
- 인증 성공 시 HMAC-SHA256으로 서명된 쿠키(`h2oc_admin_session`, httpOnly, 12시간)를 발급하며,
  서버는 별도 세션 저장소 없이 쿠키 서명만 검증합니다(무상태).
- 비밀번호가 틀리면 401 + 안내 메시지를 표시하고 접근을 차단합니다.
- `/api/submissions`(목록/삭제), `/api/admin/waste-types*` 는 모두 이 인증 미들웨어로 보호됩니다.

## 5. 동일 디바이스 닉네임 재사용

- 최초 방문 시 `localStorage`에 `crypto.randomUUID()` 기반 `device_id`를 생성/저장합니다.
- `/login` 진입 시 `GET /api/device-nickname?device_id=`로 이 디바이스가 이전에 사용한 닉네임을 조회 →
  있으면 닉네임 입력창을 건너뛰고 바로 `/select`로 이동합니다.
- 닉네임 중복 검사(`/api/nickname-check`, `POST /api/submissions`)는 `device_id`를 함께 전달하여
  **"닉네임이 같고 device_id도 같으면 중복 아님"**, **"닉네임이 같은데 device_id가 다르면 중복"**으로 판정합니다.
- `localStorage`는 새로고침/브라우저 재시작에도 유지되므로 동일 기기에서는 계속 같은 닉네임을 재사용할 수 있습니다.

## 6. SNS 스토리 공유

- 결과 화면에 인스타그램 스토리 규격(1080×1920px, 9:16)의 숨겨진 카드(`#story-card`)를 항상 렌더링해두고,
  "스토리에 공유하기" 클릭 시 `html2canvas`로 PNG 이미지를 생성합니다.
- 카드에는 닉네임, 폐기물 종류+무게, 탄소 저감량(kg), 수자원 절약률(%/텍스트)이 포함됩니다.
- 생성된 이미지는 미리보기 모달에서 **"이미지 저장"**(다운로드) 또는 **"공유하기"**(Web Share API Level 2,
  `navigator.canShare({files})` 지원 브라우저에서 네이티브 공유 시트 호출)로 사용할 수 있습니다.

## 7. 로컬 개발

```bash
npm run build
pm2 start ecosystem.config.cjs   # wrangler pages dev --local (D1 로컬 SQLite 자동 사용)

# D1 관리
npm run db:migrate:local   # 로컬 마이그레이션 적용 (0001~0003)
npm run db:seed            # 샘플 데이터 삽입
npm run db:console:local   # SQL 직접 실행
```

`.dev.vars` (gitignore 됨, 로컬 전용):
```
ADMIN_PASSWORD=h2oc2026!
```

## 8. 배포 (Cloudflare Pages + D1)

1. `npx wrangler d1 create h2oc-calculator-production` 실행 후 반환된 `database_id`를
   `wrangler.jsonc`의 `d1_databases[0].database_id`에 반영
2. `npm run db:migrate:prod` 로 운영 DB에 스키마 적용 (0001, 0002, 0003 모두 순서대로 적용됨)
3. 운영 관리자 비밀번호 설정: `npx wrangler pages secret put ADMIN_PASSWORD --project-name h2oc-calculator`
4. `npm run build && npx wrangler pages deploy dist --project-name h2oc-calculator`

## 9. 아직 구현되지 않은 기능 / 제한사항

- **엑셀 업로드 시 코드 재발급**: 업로드마다 `item_1`, `item_2`... 형태로 코드가 재발급되므로,
  기존 `submissions.waste_type` 값과 새 코드가 어긋날 수 있습니다(참고용 라벨 텍스트는 그대로 유지됨).
  운영 시에는 최초 seed 코드(pp/hdpe/pet/ldpe/paper/can)를 계속 사용하도록 엑셀 내 품목 순서를 유지하는 것을 권장합니다.
- **관리자 페이지 접근 제어(추가 계층)**: 비밀번호 인증은 구현되었으나, Hosted 배포의
  라우트 접근 규칙(허용된 이메일/인증된 사용자만 등)을 추가로 적용하면 더 강력하게 보호할 수 있습니다.
- **동일 닉네임 재제출**: 현재는 (닉네임, 디바이스) 조합당 최초 1회만 허용. 여러 번 제출해
  누적시키는 정책으로 바꾸려면 `POST /api/submissions`의 중복 검사 로직 조정 필요

## 10. 추천 다음 단계

1. 실제 계산 데이터 엑셀을 최신 상태로 관리자 페이지에서 주기적으로 업로드
2. 운영 배포 전 `ADMIN_PASSWORD` 시크릿을 기본값에서 반드시 변경
3. `/admin` 라우트에 Hosted 배포 접근 규칙 추가 적용 (선택)
4. QR 코드 생성 (팝업스토어 배포용 최종 URL 확정 후)

## 11. 기술 스택

- Hono (Cloudflare Workers) + TypeScript
- Cloudflare D1 (SQLite) — `waste_types`, `submissions` 테이블
- `xlsx` (SheetJS) — 관리자 엑셀 업로드 파싱
- `html2canvas` (CDN) — 결과 화면 → SNS 스토리 이미지 캡처
- Web Share API Level 2 — 네이티브 공유(파일)
- Web Crypto API (HMAC-SHA256) — 관리자 세션 서명
- Vanilla JS (프론트, `/static/data.js`) — CDN 의존성 최소화
- Google Fonts: Black Han Sans(제목), Noto Sans KR(본문)

## 12. 파일 구조

```
src/index.tsx           Hono 백엔드 + API + 페이지 라우트(raw HTML import) + 관리자 인증 + 엑셀 업로드
migrations/              D1 마이그레이션 SQL
  0001_initial_schema.sql
  0002_waste_types_and_device.sql   waste_types 테이블 + submissions.device_id/water_label 추가
  0003_water_percent_nullable.sql  submissions.water_percent NOT NULL 제약 제거
seed.sql                 샘플 데이터
public/
  index.html, login.html, select.html, weight.html,
  result.html, ranking.html, admin.html
  static/style.css       공통 스타일 (+ 관리자 로그인/업로드, 스토리카드, 공유모달 스타일)
  static/data.js         계산 로직 + API 연동 클라이언트 함수 (device_id, 관리자 인증 포함)
  static/images/paper-bg.jpg  배경 이미지
.dev.vars                로컬 전용 환경변수 (ADMIN_PASSWORD) - gitignore 됨
```

## 13. 배포 상태

- **환경**: 샌드박스 로컬 개발 (Cloudflare D1 `--local` 모드로 동작 확인 완료)
- **검증 완료**: 엑셀 헤더 기반 매핑/행 추가 자동 인식, 관리자 비밀번호 인증(성공/실패/세션유지),
  디바이스 기반 닉네임 재사용(동일 기기 재사용 허용 / 타 기기 차단), SNS 스토리 이미지 생성 로직
- **다음 단계**: 사용자가 Cloudflare 배포를 요청하면 위 "8. 배포" 절차대로 진행
