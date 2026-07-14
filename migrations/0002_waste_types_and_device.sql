-- H2OC 계산기: 계산 데이터(엑셀 업로드) 테이블 + 디바이스 식별/워터라벨 컬럼 추가
-- 엑셀 헤더 기준 매핑: 품목 / 배출량(g)(사용자 입력이므로 저장 X) / 탄소 절감 계수 / 수자원 절감률(%)

CREATE TABLE IF NOT EXISTS waste_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,          -- 엑셀 '품목' 컬럼 원본 값
  carbon_factor REAL NOT NULL,      -- 엑셀 '탄소 절감 계수' 컬럼
  water_percent REAL,               -- 엑셀 '수자원 절감률(%)' 컬럼 (숫자인 경우)
  water_label TEXT,                 -- 수자원 절감률이 텍스트(예: "신재 대비 대폭 절감")인 경우 원문 저장
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waste_types_sort ON waste_types(sort_order);

-- 현재 업로드된 "계산 데이터.xlsx" 내용을 기본값으로 반영 (헤더 기준 매핑 결과)
INSERT OR IGNORE INTO waste_types (code, item_name, carbon_factor, water_percent, water_label, sort_order) VALUES
  ('pp',    '플라스틱(PP, 물티슈 캡)',   1.31, 46,   NULL,               1),
  ('hdpe',  '플라스틱(HDPE,세제통)',     1.31, 59,   NULL,               2),
  ('pet',   '플라스틱(PET, 생수병)',     1.08, -4,   NULL,               3),
  ('ldpe',  '비닐(LDPE류)',              1.28, 46,   NULL,               4),
  ('paper', '폐지(종이류)',              0.2,  78,   NULL,               5),
  ('can',   '알루미늄 캔',               0.59, NULL, '신재 대비 대폭 절감', 6);

-- submissions 테이블: 디바이스 식별(재접속 시 동일 닉네임 사용) + 수자원 텍스트 라벨 지원
ALTER TABLE submissions ADD COLUMN device_id TEXT;
ALTER TABLE submissions ADD COLUMN water_label TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_device_id ON submissions(device_id);
