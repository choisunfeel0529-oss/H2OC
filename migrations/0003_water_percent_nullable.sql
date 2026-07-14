-- water_percent가 NOT NULL 제약이라 엑셀의 텍스트형 수자원 절감률(예: "신재 대비 대폭 절감")
-- 품목을 저장할 때 오류가 발생함. SQLite는 컬럼 제약을 직접 변경할 수 없으므로
-- 테이블을 재생성하는 방식으로 water_percent를 NULL 허용으로 변경한다.

CREATE TABLE submissions_new (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  waste_type TEXT NOT NULL,
  waste_label TEXT NOT NULL,
  weight_g REAL NOT NULL,
  carbon_kg REAL NOT NULL,
  water_percent REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  device_id TEXT,
  water_label TEXT
);

INSERT INTO submissions_new
  (id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, created_at, updated_at, device_id, water_label)
SELECT id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, created_at, updated_at, device_id, water_label
FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;

CREATE INDEX IF NOT EXISTS idx_submissions_nickname ON submissions(nickname);
CREATE INDEX IF NOT EXISTS idx_submissions_waste_type ON submissions(waste_type);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_device_id ON submissions(device_id);
