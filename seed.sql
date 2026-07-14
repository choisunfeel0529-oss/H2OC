-- 테스트용 샘플 데이터
INSERT OR IGNORE INTO submissions (id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, created_at) VALUES
  ('seed-001', '초록지킴이', 'pet', '플라스틱 (PET)', 850, 1.36, 51, datetime('now', '-2 days')),
  ('seed-002', '분리배출왕', 'can', '캔', 320, 1.33, 37, datetime('now', '-1 days')),
  ('seed-003', '에코러버', 'paper', '종이', 1500, 1.35, 43, datetime('now', '-6 hours')),
  ('seed-004', '지구사랑', 'hdpe', '플라스틱 (HDPE)', 600, 0.87, 39, datetime('now', '-3 hours')),
  ('seed-005', '재활용마스터', 'ldpe', '비닐 (LDPE)', 200, 0.24, 18, datetime('now', '-1 hours'));
