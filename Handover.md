# H2OC 계산기 — 개발 인수인계 문서 (Handover.md)

> 이 문서는 README.md(사용자/기능 소개용)와 별도로, **다른 개발자가 이 프로젝트를 처음 맡았을 때
> 코드를 열어보기 전에 반드시 읽어야 하는 개발 인수인계 문서**입니다.
> README는 "무엇을 하는 서비스인가"를 설명하고, 이 문서는 "어떻게 만들어졌고 어떻게 이어서 개발하는가"를 설명합니다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 최종 수정일 | 2026-07-22 |
| 작성자 / 인수자 | AI 개발 에이전트(Claude) / (인수자 미정) |
| 프로젝트 상태 | 개발중 (로컬 샌드박스에서 기능 구현 완료, 운영 배포 전) |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기획 의도](#2-기획-의도)
3. [기술 스택](#3-기술-스택)
4. [시스템 구조](#4-시스템-구조)
5. [화면별 기능 정의](#5-화면별-기능-정의)
6. [화면 이동 (Flow / Happy Path)](#6-화면-이동-flow--happy-path)
7. [데이터베이스 구조](#7-데이터베이스-구조)
8. [계산 로직](#8-계산-로직)
9. [API 명세](#9-api-명세)
10. [환경 변수](#10-환경-변수)
11. [GitHub 및 배포 정보](#11-github-및-배포-정보)
12. [디렉터리 구조](#12-디렉터리-구조)
13. [개정 이력 (Change Log)](#13-개정-이력-change-log)
14. [TODO (향후 개발 예정)](#14-todo-향후-개발-예정)
15. [유지보수 시 주의사항](#15-유지보수-시-주의사항)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | H2OC(에이치투오씨) 계산기 |
| 한 줄 설명 | 분리배출한 폐기물의 무게를 입력하면 절감된 탄소량(kg CO2eq)과 절약된 수자원 비율(%)을 계산해주고, 참여자 랭킹을 보여주는 모바일 웹 서비스 |
| 대상 사용자 | 닉네임만으로 참여하는 익명 사용자 (회원가입/로그인 시스템 없음) |
| 운영 형태 | 코드/DB 구조상 상시 운영형으로 구현되어 있음. 특정 기간 한정 여부는 코드에 명시된 정보 없음 |
| 관련 조직/담당자 | 코드/커밋 로그에 명시된 정보 없음 — **[ 확인 필요: 기획/운영 담당자 정보 추가 ]** |
| 서비스 URL | 아직 운영 배포되지 않음 (로컬 샌드박스: `http://localhost:3000`, Cloudflare Pages 프로젝트명 `h2oc-calculator`로 설정되어 있으나 미배포) |

---

## 2. 기획 의도

> ⚠️ 아래 항목 중 코드에서 직접 확인 가능한 사실만 기술했습니다. 기획서/회의록 등 코드 외부 자료는
> 이 프로젝트에 존재하지 않아 **추측하지 않고 "확인 필요"로 표시**했습니다.

- **배경/문제 정의**: 코드/주석/커밋 메시지에 명시적 기획 배경 없음. 다만 폐기물 종류별 탄소 절감 계수와
  수자원 절감률을 엑셀로 관리하는 구조(관리자가 수치를 갱신 가능)로 미루어, 환경 캠페인/체험 이벤트성
  서비스로 설계된 것으로 추정됨. **[ 확인 필요: 실제 캠페인/행사명, 운영 주체 ]**
- **핵심 가치 제안**: 무게 입력 → 즉시 탄소/수자원 절감 효과를 수치로 확인 → 랭킹으로 비교 → SNS 스토리
  이미지로 공유. "체험 → 확인 → 공유"의 3단 구조가 화면 흐름(select → weight → result)과 일치함.
- **성공 지표(KPI)**: 코드에 별도 KPI 트래킹/애널리틱스 연동 없음. `/api/ranking`의 `participant_count`,
  `total_carbon_kg` 등 요약 통계가 관리자 화면에 표시되므로, 참여자 수·누적 탄소 절감량이 사실상의
  핵심 지표로 사용되고 있음.
- **의사결정 배경(코드 근거 있는 것만)**:
  - 회원가입 없이 **닉네임만으로 참여**하도록 만든 이유: 진입 장벽을 낮추기 위한 설계로 추정(현장 이벤트형
    UX에 적합). 동일 기기 재접속 시 자동으로 이전 닉네임을 재사용하도록 만든 것(`device_id` 기반)도
    "재입력 없이 다시 참여 가능하게" 하려는 의도로 보임.
  - 계산 계수를 코드에 하드코딩하지 않고 **엑셀 업로드로 관리**하게 만든 이유: 비개발자(운영자)가
    탄소/수자원 계수를 직접 갱신할 수 있게 하기 위함으로 추정.
- **참고 자료**: 없음(코드/DB 외 별도 기획 문서 미확인).

---

## 3. 기술 스택

### 3.1 Frontend
| 기술 | 버전 | 용도/선택 이유 (코드 근거) |
|---|---|---|
| Vanilla JavaScript | - | `public/static/data.js` — CDN 의존성 없이 API 연동/계산 클라이언트 로직 작성 |
| HTML + 인라인 `<script>` | - | 화면별 `.html` 파일(`public/*.html`)에 로직 직접 포함, 별도 SPA 프레임워크 없음 |
| html2canvas | ^1.4.1 (CDN, jsdelivr) | `result.html`에서 결과 카드를 PNG 이미지로 캡처하기 위해 사용 |
| Google Fonts | - | Black Han Sans(제목), Noto Sans KR(본문) — 모든 화면 `<head>`에 포함 |

### 3.2 Backend
| 기술 | 버전 | 용도/선택 이유 (코드 근거) |
|---|---|---|
| Hono | ^4.12.30 | `src/index.tsx` — 전체 라우팅(페이지+API)을 담당하는 웹 프레임워크 |
| TypeScript | devDependencies 명시(버전 미고정) | `src/index.tsx` 작성 언어 |
| xlsx (SheetJS) | ^0.18.5 | 관리자 엑셀 업로드 파싱(`/api/admin/waste-types/upload`) |
| hono/cookie | (hono 내장) | `getCookie`/`setCookie`/`deleteCookie` — 관리자 세션 쿠키 처리 |
| Web Crypto API (`crypto.subtle`) | 런타임 내장 | 관리자 세션 토큰 HMAC-SHA256 서명/검증 |

### 3.3 Infra / Platform
| 기술 | 용도 |
|---|---|
| Cloudflare Pages/Workers | 배포 대상 런타임 (`wrangler.jsonc`에 `pages_build_output_dir: ./dist`) |
| Cloudflare D1 (SQLite) | 데이터 저장 — `wrangler.jsonc`의 `d1_databases` 바인딩명 `DB`, DB명 `h2oc-calculator-production` |
| Wrangler | ^4.110.0 — 로컬 개발(`wrangler pages dev --local`) 및 배포 CLI |
| Vite | ^8.1.4 + `@hono/vite-build/cloudflare-pages` — 빌드 도구 |
| PM2 | 로컬 샌드박스에서 `wrangler pages dev` 프로세스 관리(`ecosystem.config.cjs`) |

### 3.4 사용 불가/제약 사항
- Cloudflare Workers 런타임이므로 Node.js 전용 API(`fs`, `child_process` 등) 사용 불가.
  (단, `compatibility_flags: ["nodejs_compat"]`가 설정되어 있어 일부 Node.js 호환 API는 사용 가능 — `xlsx` 패키지 동작을 위해 필요)
- 정적 파일은 `public/` 폴더에 위치해야 하며 `hono/cloudflare-workers`의 `serveStatic({root:'./public'})`으로만 서빙됨.
  `@hono/node-server/serve-static`은 사용하지 않음(현재 코드에 해당 import 없음).
- 관리자 페이지의 엑셀 업로드는 **런타임에 파일을 디스크에 저장하지 않고**, 요청 시점에 메모리에서
  `ArrayBuffer` → `XLSX.read()` → DB INSERT로 즉시 처리(파일 시스템 미사용).

---

## 4. 시스템 구조

```
  사용자(모바일 브라우저)
        │
        ▼
  Cloudflare Pages (정적 자산 + Worker: src/index.tsx)
        │
        ├── 페이지 라우트 (Hono, raw HTML import)
        │     /  /login  /select  /weight  /result  /ranking  /admin
        │
        ├── 정적 자산 서빙 (/static/*  →  public/static/*)
        │
        ├── API 라우트 (/api/*)
        │     ├── 공개 API: waste-types, nickname-check, device-nickname,
        │     │              submissions(POST), ranking, ranking/me
        │     └── 관리자 API: admin/login, admin/logout, admin/check,
        │                      admin/waste-types(GET/upload),
        │                      submissions(GET), submissions/:id(DELETE)
        │           └── adminAuthMiddleware (HMAC 서명 쿠키 검증)
        │
        └── Cloudflare D1 (SQLite, binding: DB)
              ├── waste_types 테이블   (엑셀 업로드로 관리되는 계산 계수)
              └── submissions 테이블   (참여자 제출 기록)
```

- **구성요소별 역할**
  | 구성요소 | 역할 | 위치 |
  |---|---|---|
  | Hono Worker | 페이지 서빙 + API 처리 + 관리자 인증 미들웨어 전부 담당 (단일 파일) | `src/index.tsx` |
  | D1 DB | `waste_types`, `submissions` 두 테이블만 존재. 영구 저장 | Cloudflare D1 (로컬: `.wrangler/state/v3/d1`) |
  | 정적 자산 | CSS 1개, JS 1개(공통 로직), 이미지 디렉터리 | `public/static/` |
  | 화면 HTML | 화면별 `.html` 파일에 style/script 인라인 포함, Vite가 `?raw`로 워커에 임베드 | `public/*.html` |

- **외부 연동 서비스**: 없음. Google Fonts CDN, html2canvas CDN 스크립트 로드만 존재하며 별도 서버 API 연동(결제, 이메일, 인증 서비스 등)은 없음.
- **인증/세션 방식 개요**: 사용자(일반 참여자) 대상 로그인/인증은 없음(닉네임 + 브라우저 `localStorage` 기반 device_id로 식별). 관리자 전용으로 비밀번호 로그인 + HMAC 서명 쿠키 세션이 존재함(상세는 9, 10번 항목 참조).

---

## 5. 화면별 기능 정의

### 5.1 메인 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/` |
| 파일 | `public/index.html` |
| 목적 | 서비스 진입점, 메뉴 제공 |
| 주요 기능 | "계산하러 가기"(`/login`으로 이동), "내 랭킹 보러 가기"(`/ranking`으로 이동), 하단 링크로 "전체 참여 현황 보기"(`/ranking`), "관리자 데이터 조회"(`/admin`) |
| 진입 조건 | 누구나 접근 가능 (인증 없음) |
| 이탈(다음) 경로 | `/login`, `/ranking`, `/admin` |
| 예외/에러 케이스 | 별도 API 호출 없는 정적 화면이므로 에러 케이스 없음 |

### 5.2 닉네임 입력 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/login` |
| 파일 | `public/login.html` |
| 목적 | 참여자 식별용 닉네임 입력 (또는 동일 기기 재접속 시 자동 재사용) |
| 주요 기능 | ① 페이지 로드 시 `GET /api/device-nickname`으로 이 기기가 이전에 쓴 닉네임 조회 → 있으면 화면 노출 없이 즉시 `/select`로 리다이렉트, ② 없으면 로딩 화면을 닉네임 입력 폼으로 전환, 최근 닉네임(`localStorage`) 자동 채움, ③ 제출 시 `GET /api/nickname-check`로 중복 확인 후 통과하면 `sessionStorage`/`localStorage`에 닉네임 저장하고 `/select`로 이동 |
| 진입 조건 | 누구나 접근 가능 |
| 이탈(다음) 경로 | `/select` (자동/수동 모두), 뒤로가기는 `/` |
| 예외/에러 케이스 | 닉네임 미입력 시 폼 자체 검증(`required`)으로 차단, 20자 초과 시 에러 메시지, 서버에서 중복으로 판정되면 "이미 사용 중인 닉네임입니다" 표시 후 재입력 유도, API 오류 시 "닉네임 확인 중 오류가 발생했습니다" 표시 |

### 5.3 폐기물 선택 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/select` |
| 파일 | `public/select.html` |
| 목적 | 분리배출한 폐기물 종류 선택 |
| 주요 기능 | `GET /api/waste-types`로 목록 조회 후 카드 형태로 렌더링, 카드 클릭 시 선택 상태 토글(`sessionStorage`에 `waste_code` 저장), "다음으로" 버튼은 선택 전까지 비활성화 |
| 진입 조건 | `sessionStorage`에 닉네임이 없으면 `/login`으로 강제 리다이렉트 |
| 이탈(다음) 경로 | `/weight` (선택 완료 후), 뒤로가기는 `/login` |
| 예외/에러 케이스 | `waste_types` 데이터가 비어 있으면 "등록된 계산 데이터가 없습니다. 관리자에게 문의해주세요." 표시하고 다음 버튼 비활성화 유지 |

### 5.4 무게 입력 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/weight` |
| 파일 | `public/weight.html` |
| 목적 | 분리배출 무게(g) 입력 및 계산 요청 |
| 주요 기능 | `GET /api/waste-types`로 선택된 폐기물의 `item_name`을 조회해 페이지 제목에 반영, 폼 제출 시 `POST /api/submissions` 호출로 계산+저장 요청, 성공 시 결과를 `sessionStorage`(`h2oc_result`)에 저장 후 `/result`로 이동 |
| 진입 조건 | `sessionStorage`에 닉네임 또는 waste_code가 없으면 각각 `/login`, `/select`로 강제 리다이렉트 |
| 이탈(다음) 경로 | `/result` (성공 시), 뒤로가기는 `/select` |
| 예외/에러 케이스 | 무게 미입력/0 이하/숫자 아님 → "무게는 0보다 큰 숫자로 입력해주세요.", 1,000,000 초과 → "무게 값이 너무 큽니다.", 서버 409(닉네임 중복) → "닉네임이 이미 사용되었습니다. 처음으로 돌아가 다시 시도해주세요.", 그 외 오류 → 서버 에러 메시지 또는 기본 문구 표시 |

### 5.5 결과 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/result` |
| 파일 | `public/result.html` |
| 목적 | 계산된 탄소 절감량/수자원 절약률 표시 및 SNS 공유용 이미지 생성 |
| 주요 기능 | `sessionStorage`(`h2oc_result`)의 데이터로 결과 수치 렌더링, 화면에는 보이지 않는 9:16 비율(1080×1920px) 스토리 카드(`#story-card`)를 항상 준비해둠, "스토리에 공유하기" 클릭 시 `html2canvas`로 카드를 PNG로 캡처 → 미리보기 모달 표시 → "이미지 저장"(다운로드) 또는 "공유하기"(Web Share API Level 2, `navigator.canShare({files})` 지원 시에만 버튼 노출) |
| 진입 조건 | `sessionStorage`에 결과 데이터가 없으면 `/`로 강제 리다이렉트 |
| 이탈(다음) 경로 | "내 랭킹 보러 가기" 클릭 시 `/ranking`, 뒤로가기(로고 버튼)는 `/` |
| 예외/에러 케이스 | `water_percent`가 숫자가 아닌 경우(텍스트 라벨) `water_label`을 대신 표시, 이미지 생성 실패 시 "이미지 생성에 실패했습니다"/"이미지 생성 중 오류가 발생했습니다" 토스트 표시 |

### 5.6 랭킹 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/ranking` |
| 파일 | `public/ranking.html` |
| 목적 | 전체 참여 통계 및 TOP 100 랭킹, 내 순위 표시 |
| 주요 기능 | `GET /api/ranking?limit=100`으로 요약 통계(참여자 수/누적 탄소/평균 수자원) 및 TOP100 조회, 1~3위는 금/은/동 배지 표시, `sessionStorage` 또는 `localStorage`에 저장된 내 닉네임이 있으면 `GET /api/ranking/me`로 별도 조회해 "내 랭킹" 섹션에 하이라이트 표시(TOP100 밖이어도 조회됨) |
| 진입 조건 | 누구나 접근 가능(인증 불필요) |
| 이탈(다음) 경로 | "나도 계산하러 가기" 클릭 시 `/login`, 뒤로가기는 `/` |
| 예외/에러 케이스 | 참여 데이터 없음 → "아직 참여 데이터가 없어요." / "아직 랭킹 데이터가 없습니다. 첫 번째 참여자가 되어보세요!" 표시 |

### 5.7 관리자 화면
| 항목 | 내용 |
|---|---|
| 경로 | `/admin` |
| 파일 | `public/admin.html` |
| 목적 | 참여 데이터 조회/관리 및 계산 데이터(엑셀) 갱신 |
| 주요 기능 | ① 페이지 로드 시 `GET /api/admin/check`로 세션 유효성 확인 → 유효하면 데이터 화면 바로 진입, 아니면 비밀번호 로그인 화면 노출, ② 로그인(`POST /api/admin/login`) 성공 시 데이터 화면 전환, ③ 요약 통계(참여자수/누적탄소/평균수자원/누적무게) 표시, ④ 계산 데이터 엑셀 업로드(`POST /api/admin/waste-types/upload`), ⑤ 닉네임 검색/폐기물 필터/페이지네이션이 있는 전체 제출 목록 표(`GET /api/submissions`), ⑥ 레코드 삭제(`DELETE /api/submissions/:id`), ⑦ CSV 다운로드(클라이언트에서 여러 페이지를 모아 생성), ⑧ 로그아웃(`POST /api/admin/logout`) |
| 진입 조건 | 비밀번호 인증 필요. 미인증 시 데이터 화면의 모든 API 호출은 401 반환 |
| 이탈(다음) 경로 | "메인으로" 클릭 시 `/`, 로그아웃 시 로그인 화면으로 복귀 |
| 예외/에러 케이스 | 비밀번호 불일치 → "비밀번호가 일치하지 않습니다. 다시 입력해주세요.", 세션 만료(401) 감지 시 토스트 표시 후 로그인 화면으로 강제 복귀, 엑셀 업로드 실패(형식 오류/필수 컬럼 누락) → 서버 에러 메시지 표시 |

---

## 6. 화면 이동 (Flow / Happy Path)

### 6.1 Happy Path (정상 흐름)
```
/  (메인)
 └─ "계산하러 가기" 클릭
      → /login (닉네임 입력, 또는 동일기기 재접속 시 자동 스킵)
      → /select (폐기물 선택)
      → /weight (무게 입력 + 계산 요청)
      → /result (결과 확인 + SNS 스토리 공유)
      → /ranking ("내 랭킹 보러 가기" 클릭 시)
```

관리자 흐름(별도 경로):
```
/  → "관리자 데이터 조회" 클릭 → /admin
      → (미인증) 비밀번호 입력 → 인증 성공 → 데이터 화면
      → (기인증, 쿠키 유효) 데이터 화면 즉시 진입
```

### 6.2 주요 분기 / 예외 흐름
| 케이스 | 발생 화면 | 처리 방식 |
|---|---|---|
| `/select`, `/weight`, `/result` 진입 시 필수 세션 데이터 없음 | select/weight/result | 각각 필요한 이전 단계 화면으로 강제 `location.href` 리다이렉트 |
| 닉네임 중복(다른 기기가 이미 사용 중) | login, weight | login: 제출 전 사전 확인으로 차단 / weight: 서버 최종 검증에서 409 발생 시 에러 표시 |
| 동일 기기 재접속 | login | `/api/device-nickname` 조회 결과가 있으면 입력 화면을 건너뛰고 `/select`로 즉시 이동 |
| 관리자 미인증 상태에서 보호된 API 호출 | admin | 클라이언트가 401 응답을 감지(`handleAuthError`)하여 로그인 화면으로 강제 복귀 + 토스트 안내 |
| 계산 데이터(`waste_types`)가 비어 있음 | select | 카드 목록 대신 안내 문구 표시, 다음 단계 진행 차단(버튼 비활성화) |

### 6.3 상태 저장 위치
| 데이터 | 저장 위치 | 생명주기 | 용도 |
|---|---|---|---|
| `h2oc_nickname` | `sessionStorage` | 브라우저 탭/세션 종료 시 소멸 | 현재 진행 중인 계산 흐름에서 닉네임 유지(select/weight/result에서 참조) |
| `h2oc_waste_code` | `sessionStorage` | 세션 종료 시 소멸 | 선택한 폐기물 코드 유지(weight에서 참조) |
| `h2oc_result` | `sessionStorage` | 세션 종료 시 소멸 | 계산 결과 저장(result 화면에서 렌더링) |
| `h2oc_last_nickname` | `localStorage` | 영구(사용자가 지우지 않는 한) | 다음 방문 시 닉네임 입력 필드 자동완성, 랭킹 화면에서 "내 랭킹" 조회용 fallback |
| `h2oc_device_id` | `localStorage` | 영구 | 기기 식별용 UUID. 닉네임 중복 판정/재사용의 핵심 키 |
| `h2oc_admin_session` (쿠키명) | Cookie (httpOnly) | 발급 후 12시간(`maxAge`) | 관리자 인증 세션(서버에서 HMAC 서명 검증, 클라이언트 JS로 직접 접근 불가) |
| `waste_types`, `submissions` 데이터 전체 | Cloudflare D1 | 영구 | 최종 소스 오브 트루스(Source of Truth). 모든 클라이언트 저장값은 서버에서 재검증됨 |

---

## 7. 데이터베이스 구조

### 7.1 ERD (개략)
```
waste_types (code 기준, 1)  ────  (N) submissions (waste_type 컬럼으로 code 참조)
```
※ 실제 DB 레벨 FOREIGN KEY 제약은 걸려 있지 않음(SQLite에서 명시적 FK 선언 없이 애플리케이션 레벨에서만 코드값을 매칭).

### 7.2 테이블: `waste_types`
> 파일 위치: `migrations/0002_waste_types_and_device.sql`

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 내부 식별자 |
| code | TEXT | UNIQUE NOT NULL | 폐기물 코드. seed 값: `pp`/`hdpe`/`pet`/`ldpe`/`paper`/`can`. 관리자가 엑셀 업로드 시 `item_1`, `item_2`... 형태로 재발급됨(아래 "8.2" 참고) |
| item_name | TEXT | NOT NULL | 엑셀 "품목" 컬럼 원본 값 (화면에 표시되는 이름) |
| carbon_factor | REAL | NOT NULL | 엑셀 "탄소 절감 계수" 컬럼 |
| water_percent | REAL | NULL 허용 | 엑셀 "수자원 절감률(%)" 숫자 값. 텍스트인 경우 NULL |
| water_label | TEXT | NULL 허용 | water_percent가 숫자가 아닌 경우의 원문 텍스트 (예: "신재 대비 대폭 절감") |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 엑셀 행 순서 기준 화면 표시 순서 |
| created_at / updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 생성/수정 시각 |

- **인덱스**: `idx_waste_types_sort` (컬럼: `sort_order`) — 목록 조회 시 정렬 성능용
- **비고**: 관리자가 엑셀을 업로드하면 `DELETE FROM waste_types` 후 전체 재삽입되는 방식(부분 업데이트 아님). 현재 시드 데이터(6종)는 마이그레이션 파일에 `INSERT OR IGNORE`로 포함되어 있음.

### 7.3 테이블: `submissions`
> 파일 위치: `migrations/0001_initial_schema.sql` (최초 생성) → `0002`(컬럼 추가) → `0003`(제약 변경, 테이블 재생성)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID (`crypto.randomUUID()`로 서버에서 생성) |
| nickname | TEXT | NOT NULL | 참여자 닉네임 |
| waste_type | TEXT | NOT NULL | `waste_types.code` 참조값 (애플리케이션 레벨 참조, FK 제약 없음) |
| waste_label | TEXT | NOT NULL | 제출 시점의 `waste_types.item_name` 스냅샷 |
| weight_g | REAL | NOT NULL | 입력 무게(g) |
| carbon_kg | REAL | NOT NULL | 서버에서 계산한 탄소 절감량 |
| water_percent | REAL | NULL 허용 (0003에서 NOT NULL → NULL 허용으로 변경) | 서버에서 계산한 수자원 절약률(숫자인 경우) |
| water_label | TEXT | NULL 허용 (0002에서 추가) | 수자원 절약률이 텍스트인 경우의 값 |
| device_id | TEXT | NULL 허용 (0002에서 추가) | 제출한 기기의 식별자(localStorage UUID) |
| created_at / updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 생성/수정 시각 |

- **인덱스**: `idx_submissions_nickname`(nickname), `idx_submissions_waste_type`(waste_type), `idx_submissions_created_at`(created_at), `idx_submissions_device_id`(device_id)
- **비고**: `nickname`에 대한 DB 레벨 UNIQUE 제약은 없음. 중복 방지는 전적으로 애플리케이션 코드(`POST /api/submissions` 내 사전 조회 쿼리)에서만 처리됨.

### 7.4 마이그레이션 관리 규칙
- SQLite는 `ALTER TABLE ... ALTER COLUMN`(제약조건 변경)을 지원하지 않으므로, `0003_water_percent_nullable.sql`에서는
  **새 테이블(`submissions_new`) 생성 → 기존 데이터 `INSERT SELECT`로 복사 → 기존 테이블 `DROP` → `RENAME`** 방식을 사용함.
  향후 컬럼 제약을 변경해야 할 경우 동일한 패턴을 따를 것.
- 마이그레이션 파일은 `migrations/0001_*.sql`, `0002_*.sql`, `0003_*.sql` 형태로 4자리 순번 + 스네이크케이스 설명을 붙임.
- 로컬 반영: `npm run db:migrate:local` (`wrangler d1 migrations apply h2oc-calculator-production --local`)
- 운영 반영: `npm run db:migrate:prod` (`wrangler d1 migrations apply h2oc-calculator-production`)
- DB 강제 초기화(로컬 전용): `npm run db:reset` — `.wrangler/state/v3/d1` 삭제 후 마이그레이션+시드 재실행

---

## 8. 계산 로직

### 8.1 계산 공식
> 코드 위치: `src/index.tsx`의 `computeResultFromType()` 함수 (약 166~176번째 줄)

```
weightKg = weight_g(사용자 입력, g) / 1000
carbon_kg = round( carbon_factor(waste_types 테이블) × weightKg × 1000 ) / 1000

water_percent = waste_types.water_percent 값 그대로 사용 (품목별 고정값, 무게에 비례하지 않음)
water_label   = waste_types.water_percent가 없을 때(텍스트형) waste_types.water_label 값 그대로 사용
```

- 탄소 절감량은 원본 엑셀의 수식(`총 탄소 절감량(kg) = (배출량(g)/1000) × 탄소 절감 계수`)과 동일한 방식으로 서버에서 재계산됨.
- 수자원 절감률은 무게와 무관하게 **품목별 고정 값**(엑셀에 정의된 값)을 그대로 사용함. 무게에 비례해 계산되는 값이 아님(코드상 별도 가중치 연산 없음).

### 8.2 계수/기준 데이터 출처 및 관리 방식
| 항목 | 내용 |
|---|---|
| 데이터 출처 | 관리자가 `/admin` 화면에서 업로드하는 엑셀 파일 (원본 예시 파일명: `계산 데이터.xlsx`) |
| 관리 방식 | 업로드 즉시 `waste_types` 테이블 전체를 `DELETE` 후 새 엑셀 내용으로 재삽입 (부분 갱신 아님) |
| 갱신 주체 | `/admin` 로그인 후 "계산 데이터 엑셀 업로드" 기능을 사용하는 관리자 |
| 갱신 시 주의사항 | 1행은 반드시 헤더(컬럼명), 2행부터 실제 데이터로 처리됨. 필수 헤더: `품목`, `탄소 절감 계수`(정확히 이 이름 또는 공백 제거 후 일치해야 인식). 선택 헤더: `수자원 절감률(%)` 또는 `수자원 절감률`. **업로드마다 `code`가 `item_1`, `item_2`...로 재발급되므로, 기존 `submissions.waste_type` 값(예: `pp`, `hdpe`)과 새 코드가 어긋날 수 있음** — 운영 시 반드시 엑셀 내 품목 순서를 유지하거나 별도 코드 매핑 정책이 필요함(14번 TODO 참조) |

### 8.3 계산 함수 위치 (코드 레퍼런스)
| 함수/모듈 | 파일 위치 | 설명 |
|---|---|---|
| `computeResultFromType(type, weightG)` | `src/index.tsx` (약 166줄) | 탄소/수자원 계산 본체 |
| `getWasteTypeByCode(c, code)` | `src/index.tsx` (약 159줄) | `waste_types` 테이블에서 code로 조회 |
| `normalizeHeader(h)` / `HEADER_ALIASES` | `src/index.tsx` (약 194~204줄) | 엑셀 헤더명 정규화 및 별칭 매핑 규칙 |
| `POST /api/admin/waste-types/upload` 핸들러 | `src/index.tsx` (약 206~312줄) | 엑셀 파싱 → 검증 → DB 반영 전체 로직 |

### 8.4 예외/경계값 처리
| 케이스 | 처리 방식 |
|---|---|
| 엑셀 헤더에서 `품목`, `탄소 절감 계수` 컬럼을 찾지 못함 | 400 에러: "필수 컬럼(품목, 탄소 절감 계수)을 엑셀 헤더에서 찾을 수 없습니다." |
| 데이터 행의 품목명이 빈 값 | 해당 행 스킵(무시) |
| 탄소 절감 계수가 숫자로 변환 불가 | 해당 행 스킵(무시) — 계산 불가하므로 저장하지 않음 |
| 수자원 절감률 값이 숫자면 `water_percent`에, 숫자가 아니고 비어있지 않으면 `water_label`에 저장 | `Number.isFinite()` 체크로 분기 |
| 유효한 데이터 행이 하나도 없음 | 400 에러: "유효한 데이터 행을 찾지 못했습니다." |
| 사용자 입력 무게가 0 이하/숫자 아님 | 400 에러: "무게는 0보다 큰 숫자여야 합니다." (서버) / 동일 문구 클라이언트 사전 검증 |
| 사용자 입력 무게가 1,000,000(g) 초과 | 400 에러: "무게 값이 너무 큽니다." |
| 존재하지 않는 waste_type 코드로 제출 시도 | 400 에러: "유효하지 않은 폐기물 종류입니다." |

---

## 9. API 명세

### 9.1 공개 API
| Method | Path | Request | Response | 설명 |
|---|---|---|---|---|
| GET | `/api/waste-types` | - | `{ "data": WasteTypeRow[] }` | 폐기물 종류 목록 (sort_order 기준 정렬) |
| GET | `/api/nickname-check` | query: `nickname`(필수), `device_id`(선택) | `{ "taken": boolean }` | 닉네임 중복 여부. device_id 전달 시 동일 기기의 기존 사용 내역은 중복으로 판정하지 않음 |
| GET | `/api/device-nickname` | query: `device_id`(필수) | `{ "nickname": string \| null }` | 해당 기기가 마지막으로 사용한 닉네임 조회 |
| POST | `/api/submissions` | body: `{ nickname, waste_type, weight_g, device_id? }` | 성공 시 `{ id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, water_label, created_at }` | 계산 수행 + DB 저장. 서버에서 닉네임/무게/폐기물종류 최종 검증 |
| GET | `/api/ranking` | query: `limit`(선택, 기본 100, 최대 500) | `{ summary: {...}, ranking: [...] }` | 전체 요약 통계 + 닉네임별 합산 TOP N |
| GET | `/api/ranking/me` | query: `nickname`(필수) | `{ found: boolean, rank?, total?, data? }` | 특정 닉네임의 전체 순위 |

**`POST /api/submissions` 에러 응답**
| 상태코드 | 조건 |
|---|---|
| 400 | 닉네임 미입력/20자 초과, 유효하지 않은 waste_type, 무게가 0 이하이거나 1,000,000 초과, 요청 본문 파싱 실패 |
| 409 | 닉네임이 다른 기기에서 이미 사용 중 |

### 9.2 인증 필요 API (관리자)
| Method | Path | 인증 방식 | Request | Response | 설명 |
|---|---|---|---|---|---|
| POST | `/api/admin/login` | - (로그인 자체) | body: `{ password }` | 성공: `{ success: true }` + Set-Cookie / 실패: `{ error }` | 비밀번호 검증 후 세션 쿠키 발급 |
| POST | `/api/admin/logout` | 없음(누구나 호출 가능) | - | `{ success: true }` | 쿠키 삭제 |
| GET | `/api/admin/check` | 쿠키(선택적 검증) | - | `{ authenticated: boolean }` | 현재 세션 유효 여부 확인 |
| POST | `/api/admin/waste-types/upload` | 쿠키(필수) | multipart/form-data, field명 `file` | 성공: `{ success: true, count, data: [...] }` / 실패: `{ error }` | 엑셀 업로드 → `waste_types` 전체 교체 |
| GET | `/api/admin/waste-types` | 쿠키(필수) | - | `{ data: WasteTypeRow[] }` | 현재 등록된 계산 데이터 전체 조회 (관리자용) |
| GET | `/api/submissions` | 쿠키(필수) | query: `page`, `limit`(최대200), `nickname`, `waste_type` | `{ data: [...], total, page, limit }` | 전체 제출 목록 (검색/필터/페이지네이션) |
| DELETE | `/api/submissions/:id` | 쿠키(필수) | - | `{ success: true }` | 레코드 삭제 |

### 9.3 에러 응답 규칙
| HTTP 상태코드 | 의미 | 공통 응답 형식 |
|---|---|---|
| 400 | 잘못된 요청(입력값 검증 실패) | `{ "error": "..." }` |
| 401 | 관리자 인증 실패/필요 | `{ "error": "..." }` (로그인 실패 시 "비밀번호가 일치하지 않습니다.", 미인증 접근 시 "관리자 인증이 필요합니다.") |
| 409 | 닉네임 중복(다른 기기) | `{ "error": "이미 사용 중인 닉네임입니다." }` |

---

## 10. 환경 변수

| 변수명 | 필수 여부 | 로컬 설정 위치 | 운영 설정 방법 | 설명 | 노출 위험도 |
|---|---|---|---|---|---|
| `ADMIN_PASSWORD` | 선택 (미설정 시 코드 내 기본값 사용) | `.dev.vars` (`ADMIN_PASSWORD=h2oc2026!`) | `npx wrangler pages secret put ADMIN_PASSWORD --project-name h2oc-calculator` | 관리자 로그인 비밀번호. 동시에 HMAC 서명 시크릿으로도 사용됨(`getAdminSecret()`) | 상 — 유출 시 관리자 페이지 전체(데이터 조회/삭제/엑셀 업로드) 노출 |

- **기본값 존재 여부 및 위험성**: `src/index.tsx`에 `DEFAULT_ADMIN_PASSWORD = 'h2oc2026!'`가 하드코딩되어 있음.
  `ADMIN_PASSWORD` 환경변수가 설정되지 않으면 이 값이 그대로 사용됨. **운영 배포 전 반드시 `wrangler pages secret put`으로 별도 값을 설정해야 함.**
- **.gitignore 확인 필수 항목**: `.dev.vars`는 `.gitignore`에 포함되어 있어 git에 커밋되지 않음(확인됨).

---

## 11. GitHub 및 배포 정보

### 11.1 저장소 정보
| 항목 | 내용 |
|---|---|
| 저장소 URL | `https://github.com/choisunfeel0529-oss/H2OC.git` |
| 기본 브랜치 | `main` |
| 브랜치 전략 | 단일 `main` 브랜치에 직접 커밋/푸시하는 방식으로 운영되어 왔음(별도 feature 브랜치/PR 사용 이력 없음) |
| 커밋 컨벤션 | 별도 규칙 없음. 지금까지의 커밋 메시지는 한글로 "무엇을 구현했는지" 요약 후 상세 항목을 본문에 나열하는 형식 |

### 11.2 배포 정보
| 항목 | 내용 |
|---|---|
| 배포 플랫폼 | Cloudflare Pages/Workers (예정 — 아직 실제 배포 미실행) |
| 배포 방식 | 수동(wrangler CLI). CI/CD 파이프라인 없음 |
| 운영 프로젝트명 | `h2oc-calculator` (`wrangler.jsonc`의 `name` 필드) |
| 배포 명령어 | `npm run build && npx wrangler pages deploy` (package.json `deploy` 스크립트) |
| 배포 권한 보유자 | **[ 확인 필요: Cloudflare 계정 소유자/권한자 ]** |
| 배포 전 체크리스트 | ① `npm run db:migrate:prod`로 운영 D1에 마이그레이션(0001~0003) 적용 여부, ② `ADMIN_PASSWORD` 시크릿을 기본값에서 변경했는지, ③ `wrangler.jsonc`의 `d1_databases[0].database_id`가 `local-placeholder-id`가 아닌 실제 운영 DB ID로 교체되었는지(**현재 placeholder 상태 — 반드시 확인 필요**) |

### 11.3 도메인/DNS
| 항목 | 내용 |
|---|---|
| 운영 도메인 | 미확정(아직 미배포) |
| DNS 관리처 | **[ 확인 필요 ]** |
| SSL 인증서 관리 | Cloudflare Pages 배포 시 자동 관리(별도 설정 이력 없음) |

---

## 12. 디렉터리 구조

```
webapp/
├── src/
│   └── index.tsx          # Hono 백엔드 전체 (페이지 라우팅 + API + 관리자 인증 + 엑셀 업로드), 단일 파일 564줄
├── migrations/
│   ├── 0001_initial_schema.sql              # submissions 테이블 최초 생성
│   ├── 0002_waste_types_and_device.sql      # waste_types 테이블 생성 + submissions에 device_id/water_label 컬럼 추가
│   └── 0003_water_percent_nullable.sql      # submissions.water_percent NOT NULL 제약 제거(테이블 재생성)
├── public/
│   ├── index.html          # 메인 화면
│   ├── login.html          # 닉네임 입력 화면
│   ├── select.html         # 폐기물 선택 화면
│   ├── weight.html         # 무게 입력 화면
│   ├── result.html         # 결과 + SNS 스토리 공유 화면
│   ├── ranking.html        # 랭킹 화면
│   ├── admin.html          # 관리자 화면(비밀번호 로그인 포함)
│   └── static/
│       ├── style.css       # 전체 공통 스타일(화면별 클래스 포함)
│       ├── data.js         # 공통 클라이언트 로직: API 호출 함수, device_id 관리, 관리자 인증 클라이언트 함수 등
│       └── images/          # 배경 이미지 등 정적 리소스
├── seed.sql                 # 로컬 개발용 샘플 submissions 5건
├── .dev.vars                # 로컬 전용 환경변수(ADMIN_PASSWORD) — git 미추적
├── wrangler.jsonc            # Cloudflare Pages/D1 설정 (프로젝트명, D1 바인딩)
├── ecosystem.config.cjs      # PM2 설정(로컬 wrangler dev 프로세스 관리)
├── vite.config.ts             # Vite + @hono/vite-build(cloudflare-pages) 빌드 설정
├── tsconfig.json               # TypeScript 설정(JSX: hono/jsx)
└── package.json                 # 의존성 및 npm scripts(빌드/배포/DB 마이그레이션 등)
```

- **신규 파일 추가 규칙(현재 코드 패턴 기준)**: 새 화면을 추가하려면 ① `public/새화면.html` 작성, ②
  `src/index.tsx` 상단에 `import 새화면Html from '../public/새화면.html?raw'` 추가, ③
  `app.get('/새경로', (c) => c.html(새화면Html))` 라우트 추가, ④ 필요 시 `public/static/data.js`에 공용 함수 추가.
- **네이밍 규칙**: 파일명은 화면 역할을 그대로 영문 소문자로 표기(`login.html`, `select.html` 등). API 경로는
  `/api/` 접두사 + kebab-case(`nickname-check`, `device-nickname`) 또는 리소스명(`submissions`, `ranking`).

---

## 13. 개정 이력 (Change Log)

| 버전 | 날짜 | 작성자 | 변경 내용 |
|---|---|---|---|
| v1.0 | 2026-07-22 | AI 개발 에이전트(Claude) | Handover.md 최초 작성. 현재 구현된 전체 기능(엑셀 헤더 기반 계산 데이터, 관리자 비밀번호 인증, SNS 스토리 공유, 디바이스 기반 닉네임 재사용 포함)을 기준으로 15개 항목 전체 기술 |

> ⚠️ 주요 기능 추가/구조 변경 시 이 표와 함께 관련 섹션(4, 7, 9 등)도 반드시 갱신할 것.

---

## 14. TODO (향후 개발 예정)

> 아래 항목은 코드/README/커밋 로그에서 명시적으로 "미구현" 또는 "제약사항"으로 확인된 것만 기재했습니다.

| 우선순위 | 항목 | 배경/이유 | 참고 |
|---|---|---|---|
| 상 | 엑셀 업로드 시 `waste_types.code` 재발급 문제 해결 | 업로드마다 `item_1`, `item_2`...로 코드가 새로 생성되어 기존 `submissions.waste_type`(예: `pp`, `hdpe`)과 참조가 어긋날 수 있음. 코드 고정 매핑 정책 또는 품목명 기준 매칭 방식 필요 | `src/index.tsx` 엑셀 업로드 핸들러 |
| 상 | 운영 D1 데이터베이스 ID 실제 값으로 교체 | `wrangler.jsonc`의 `database_id`가 현재 `local-placeholder-id`로 되어 있어 실제 배포 시 반드시 `wrangler d1 create`로 발급받은 ID로 교체해야 함 | `wrangler.jsonc` |
| 상 | `ADMIN_PASSWORD` 운영값 설정 | 현재 기본값(`h2oc2026!`)이 코드에 하드코딩되어 있어, 별도 시크릿 설정 없이 배포하면 보안 위험 | `src/index.tsx`의 `DEFAULT_ADMIN_PASSWORD` |
| 중 | `/admin` 라우트에 대한 플랫폼 레벨 접근 제어(허용 이메일/인증된 사용자 등) | 현재는 비밀번호 인증만 존재. 추가 계층(Hosted 배포 접근 규칙)을 얹으면 더 안전 | README.md 참조 |
| 중 | 동일 닉네임 재제출(누적) 정책 결정 | 현재는 (닉네임, 기기) 조합당 최초 1회만 허용. 여러 번 제출해 누적시키는 정책으로 바꾸려면 `POST /api/submissions`의 중복 검사 로직 조정 필요 | `src/index.tsx` |
| 하 | SNS 공유 시 OG 이미지/메타태그 | 현재는 Web Share API/이미지 다운로드만 구현되어 있고, 링크 공유 시의 오픈그래프 메타태그는 없음 | README.md 참조(이전 버전 기재 내용) |
| 하 | QR 코드 생성 기능 | 팝업스토어 등 현장 배포용 QR코드 생성 기능 없음(README에 다음 단계로 언급됨) | README.md 참조 |

### 14.1 알려진 제약사항 / 기술 부채
| 항목 | 현재 상태 | 개선 방향 |
|---|---|---|
| `submissions.nickname`에 DB 레벨 UNIQUE 제약 없음 | 애플리케이션 코드에서만 중복을 검사(레이스 컨디션 발생 가능성 존재) | DB 레벨 UNIQUE 제약 + 동시 요청 처리 로직 보강 검토 |
| `waste_types`와 `submissions.waste_type` 간 FK 제약 없음 | 코드 레벨에서만 유효성 검증 | 필요 시 애플리케이션 레벨 검증 유지 또는 FK 도입 검토 |
| 관리자 엑셀 업로드가 전체 교체(delete-all) 방식 | 업로드 실수 시 기존 계산 데이터가 통째로 사라짐(백업 없음) | 업로드 전 자동 백업 또는 업로드 히스토리 테이블 도입 검토 |
| CI/CD, 테스트 코드 없음 | 모든 검증이 수동 curl/브라우저 테스트로 진행됨 | 테스트 스위트 및 배포 파이프라인 구축 검토 |

---

## 15. 유지보수 시 주의사항

### 15.1 절대 하면 안 되는 것
- SQLite(D1)는 `ALTER TABLE ... ALTER COLUMN`을 지원하지 않으므로, 컬럼 제약(NOT NULL 등) 변경 시 임의로
  `ALTER COLUMN`을 시도하지 말 것. `0003_water_percent_nullable.sql`의 테이블 재생성 패턴(새 테이블 생성 →
  데이터 복사 → 기존 테이블 삭제 → 이름 변경)을 그대로 따를 것.
- Cloudflare Workers 런타임이므로 `fs`, `child_process` 등 Node.js 전용 API를 도입하지 말 것(엑셀 업로드도
  파일시스템에 쓰지 않고 메모리에서 `ArrayBuffer`로만 처리하도록 되어 있음 — 이 패턴 유지).
- 정적 파일을 `@hono/node-server/serve-static`으로 서빙하려 하지 말 것. 현재 `hono/cloudflare-workers`의
  `serveStatic`만 사용 중이며, 다른 방식은 Cloudflare Pages 환경에서 동작하지 않음.

### 15.2 수정 전 반드시 확인해야 하는 것
- `waste_types.code` 값(`pp`, `hdpe`, `pet`, `ldpe`, `paper`, `can`)을 변경하기 전에, 기존
  `submissions.waste_type` 데이터와의 참조 관계를 반드시 확인할 것(코드 값이 어긋나면 랭킹/통계에
  해당 데이터의 `waste_label`은 남아있지만 `waste_type` 코드로 다시 조회가 안 됨).
- 관리자 엑셀 업로드 기능을 수정할 때는 `HEADER_ALIASES`(헤더명 매핑 규칙)를 반드시 확인할 것 — 과거에
  "수자원 절감 효과"(엑셀의 파생 텍스트 컬럼)를 잘못 별칭으로 포함시켜 잘못된 값이 매핑된 이력이 있음
  (현재는 제거되어 "수자원 절감률(%)"만 매핑 대상).
- `ADMIN_PASSWORD`는 관리자 로그인 비밀번호이자 동시에 HMAC 서명 시크릿으로도 쓰이므로, 값을 변경하면
  기존에 발급된 관리자 세션 쿠키는 즉시 무효화됨(재로그인 필요).

### 15.3 자주 발생하는 이슈 / 트러블슈팅
| 증상 | 원인 | 해결 방법 |
|---|---|---|
| 엑셀 업로드 후 폐기물 종류가 이상한 코드(`item_1` 등)로 바뀌고 기존 통계가 이상해짐 | 업로드 시 `waste_types.code`가 항상 재발급되는 구조 | 업로드 전 기존 code 목록을 백업하거나, 14번 TODO의 코드 고정 매핑 개선 작업 선행 |
| `/admin`에서 데이터 조회 시 401이 반복됨 | 세션 쿠키(12시간) 만료 또는 `ADMIN_PASSWORD` 변경으로 기존 쿠키 무효화 | 재로그인 |
| 무게 입력 후 계산 결과에 수자원 절약률이 "-"로 표시됨 | 해당 폐기물의 `water_percent`가 NULL이고 `water_label`(텍스트)만 있는 경우(정상 동작, 예: 알루미늄 캔) | 오류 아님. `hasNumericWater` 분기 로직으로 정상 처리되는 케이스 |
| 로컬 개발 중 D1 데이터가 재시작 후 사라짐 | `npm run db:reset` 실행 또는 `.wrangler/state/v3/d1` 디렉터리 삭제 | 로컬 SQLite는 `.wrangler/state/v3/d1`에 파일로 저장되므로 삭제 시 초기화됨(의도된 동작) |

### 15.4 백업/롤백 절차
- **백업 대상**: Cloudflare D1 데이터(`waste_types`, `submissions`), 마이그레이션 파일(`migrations/*.sql`)
- **백업 방법**: 코드베이스 내 자동 백업 기능 없음. `npx wrangler d1 execute h2oc-calculator-production --command="SELECT * FROM submissions"` 등으로 수동 덤프 필요. (ProjectBackup 도구로 전체 프로젝트 디렉터리 tar.gz 백업 가능 — 코드/마이그레이션 파일 보존 목적)
- **롤백 절차**: 별도 자동 롤백 스크립트 없음. 문제 발생 시 ① 이전 git 커밋으로 코드 되돌리기(`git revert`/`git reset`), ② D1 데이터는 수동 백업 덤프가 있는 경우에만 복원 가능(현재 자동 스냅샷 기능 없음 — TODO 후보).

### 15.5 문의/에스컬레이션 채널
| 상황 | 담당자/채널 |
|---|---|
| 인프라(Cloudflare 계정/배포 권한) 관련 | **[ 확인 필요 ]** |
| 기획/정책(계산 계수, 캠페인 운영) 관련 | **[ 확인 필요 ]** |
| GitHub 저장소 접근 권한 | 저장소 소유자: `choisunfeel0529-oss` |
