-- H2OC 계산기: submissions 테이블
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  waste_type TEXT NOT NULL,
  waste_label TEXT NOT NULL,
  weight_g REAL NOT NULL,
  carbon_kg REAL NOT NULL,
  water_percent REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_nickname ON submissions(nickname);
CREATE INDEX IF NOT EXISTS idx_submissions_waste_type ON submissions(waste_type);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
