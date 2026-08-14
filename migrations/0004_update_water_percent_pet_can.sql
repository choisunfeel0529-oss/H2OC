-- 계산 데이터 수정: PET, 알루미늄 캔 수자원 절감률만 갱신 (스키마 변경 없음, 기존 계산 로직/DB구조 그대로)
-- PET: 수자원 절감률 -4% -> 0%
-- 알루미늄 캔: 문자열("신재 대비 대폭 절감") -> 숫자 79%
-- PP / HDPE / LDPE / 종이(paper), 모든 탄소 절감 계수(carbon_factor)는 변경하지 않음

UPDATE waste_types SET water_percent = 0 WHERE code = 'pet';
UPDATE waste_types SET water_percent = 79, water_label = NULL WHERE code = 'can';
