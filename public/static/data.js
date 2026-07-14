/* ==========================================================
   H2OC 계산기 - 데이터/계산 공통 로직 (Cloudflare D1 API 연동)
   ========================================================== */

// 폐기물 종류 정의
// carbonPerKg : 1kg 재활용 시 절감되는 탄소량(kg CO2eq) - 선형 적용
// waterBase   : 1kg 기준 수자원 절약률(%) - sqrt(가중치)로 완만하게 증가, 95% 상한
const WASTE_TYPES = [
  { code: 'pp',    label: '플라스틱 (PP)',   short: '플라스틱(PP)',   carbonPerKg: 1.31, waterBase: 46 },
  { code: 'hdpe',  label: '플라스틱 (HDPE)', short: '플라스틱(HDPE)', carbonPerKg: 1.45, waterBase: 50 },
  { code: 'pet',   label: '플라스틱 (PET)',  short: '플라스틱(PET)',  carbonPerKg: 1.60, waterBase: 55 },
  { code: 'ldpe',  label: '비닐 (LDPE)',     short: '비닐(LDPE)',     carbonPerKg: 1.20, waterBase: 40 },
  { code: 'paper', label: '종이',            short: '종이',           carbonPerKg: 0.90, waterBase: 35 },
  { code: 'can',   label: '캔',              short: '캔',             carbonPerKg: 4.15, waterBase: 65 },
];

const API_BASE = '/api';
const SS_NICKNAME = 'h2oc_nickname';
const SS_WASTE_CODE = 'h2oc_waste_code';
const SS_RESULT = 'h2oc_result';
const LS_LAST_NICKNAME = 'h2oc_last_nickname';

function getWasteType(code) {
  return WASTE_TYPES.find(w => w.code === code) || null;
}

/**
 * 클라이언트 사이드 미리보기 계산 (서버에서 최종 계산/검증 다시 수행함)
 * @param {string} code 폐기물 코드
 * @param {number} weightG 무게(g)
 */
function computeResult(code, weightG) {
  const type = getWasteType(code);
  if (!type) return null;
  const weightKg = weightG / 1000;
  const carbon = Math.round(type.carbonPerKg * weightKg * 100) / 100;
  const water = Math.min(95, Math.round(type.waterBase * Math.sqrt(weightKg)));
  return { carbon_kg: carbon, water_percent: water };
}

/** 닉네임 중복 확인 (서버) */
async function isNicknameTaken(nickname) {
  try {
    const res = await fetch(`${API_BASE}/nickname-check?nickname=${encodeURIComponent(nickname)}`);
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.taken;
  } catch (e) {
    console.error('isNicknameTaken error', e);
    return false;
  }
}

/** 제출 생성 (계산 + 저장, 서버에서 최종 계산/닉네임 중복 재검증) */
async function createSubmission(data) {
  const res = await fetch(`${API_BASE}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || '저장 실패');
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 랭킹 + 요약 통계 조회 */
async function fetchRanking(limit) {
  try {
    const res = await fetch(`${API_BASE}/ranking?limit=${limit || 100}`);
    if (!res.ok) return { summary: null, ranking: [] };
    return await res.json();
  } catch (e) {
    console.error('fetchRanking error', e);
    return { summary: null, ranking: [] };
  }
}

/** 특정 닉네임의 순위 조회 */
async function fetchMyRanking(nickname) {
  try {
    const res = await fetch(`${API_BASE}/ranking/me?nickname=${encodeURIComponent(nickname)}`);
    if (!res.ok) return { found: false };
    return await res.json();
  } catch (e) {
    console.error('fetchMyRanking error', e);
    return { found: false };
  }
}

/** 관리자: 전체 제출 목록 조회 (페이지네이션/검색/필터) */
async function fetchSubmissionsAdmin({ page = 1, limit = 20, nickname = '', wasteType = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (nickname) params.set('nickname', nickname);
  if (wasteType) params.set('waste_type', wasteType);
  try {
    const res = await fetch(`${API_BASE}/submissions?${params.toString()}`);
    if (!res.ok) return { data: [], total: 0 };
    return await res.json();
  } catch (e) {
    console.error('fetchSubmissionsAdmin error', e);
    return { data: [], total: 0 };
  }
}

/** 관리자: 레코드 삭제 */
async function deleteSubmission(id) {
  const res = await fetch(`${API_BASE}/submissions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('삭제 실패');
  return await res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
