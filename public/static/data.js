/* ==========================================================
   H2OC 계산기 - 데이터/계산 공통 로직 (Cloudflare D1 API 연동)
   ========================================================== */

const API_BASE = '/api';
const SS_NICKNAME = 'h2oc_nickname';
const SS_WASTE_CODE = 'h2oc_waste_code';
const SS_RESULT = 'h2oc_result';
const LS_LAST_NICKNAME = 'h2oc_last_nickname';
const LS_DEVICE_ID = 'h2oc_device_id';
/** 여러 폐기물 한 번에 계산하기: 등록 중인 폐기물 목록 / 수정 중인 항목 인덱스 */
const SS_WASTE_LIST = 'h2oc_waste_list';
const SS_EDIT_INDEX = 'h2oc_edit_index';

/**
 * 이 디바이스(브라우저)를 식별하는 고유 ID.
 * localStorage에 저장되어 새로고침/재접속/앱 재시작에도 유지된다.
 * (요청 4: 동일 디바이스 재접속 시 기존 닉네임 재사용을 위한 식별자)
 */
function getDeviceId() {
  try {
    let id = localStorage.getItem(LS_DEVICE_ID);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : ('dev-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(LS_DEVICE_ID, id);
    }
    return id;
  } catch (e) {
    // localStorage 접근 불가 시(프라이빗 모드 등) 세션 한정 임시 ID
    return 'nostore-' + Date.now();
  }
}

/** 폐기물 종류 목록 (서버 - 엑셀 업로드 데이터 기준) 캐시 */
let _wasteTypesCache = null;
async function fetchWasteTypes() {
  if (_wasteTypesCache) return _wasteTypesCache;
  try {
    const res = await fetch(`${API_BASE}/waste-types`);
    if (!res.ok) return [];
    const json = await res.json();
    _wasteTypesCache = json.data || [];
    return _wasteTypesCache;
  } catch (e) {
    console.error('fetchWasteTypes error', e);
    return [];
  }
}

function getWasteTypeFromList(list, code) {
  return list.find(w => w.code === code) || null;
}

/* ----------------------------------------------------------------
   여러 폐기물 한 번에 계산하기: 등록 목록(sessionStorage) 공통 헬퍼
   각 항목: { waste_code, waste_label, weight_g }
   ---------------------------------------------------------------- */
function getWasteList() {
  try {
    const raw = sessionStorage.getItem(SS_WASTE_LIST);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function setWasteList(list) {
  sessionStorage.setItem(SS_WASTE_LIST, JSON.stringify(list || []));
}

function clearWasteFlow() {
  sessionStorage.removeItem(SS_WASTE_LIST);
  sessionStorage.removeItem(SS_WASTE_CODE);
  sessionStorage.removeItem(SS_EDIT_INDEX);
}

/** 닉네임 중복 확인 (서버, 동일 디바이스 재사용 허용) */
async function isNicknameTaken(nickname) {
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`${API_BASE}/nickname-check?nickname=${encodeURIComponent(nickname)}&device_id=${encodeURIComponent(deviceId)}`);
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.taken;
  } catch (e) {
    console.error('isNicknameTaken error', e);
    return false;
  }
}

/** 이 디바이스가 이전에 사용한 닉네임 조회 (있으면 로그인 화면 자동 스킵용) */
async function fetchDeviceNickname() {
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`${API_BASE}/device-nickname?device_id=${encodeURIComponent(deviceId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.nickname || null;
  } catch (e) {
    console.error('fetchDeviceNickname error', e);
    return null;
  }
}

/** 제출 생성 (계산 + 저장, 서버에서 최종 계산/닉네임 중복 재검증) */
async function createSubmission(data) {
  const res = await fetch(`${API_BASE}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, data, { device_id: getDeviceId() }))
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

/** 관리자: 로그인 */
async function adminLogin(password) {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || '로그인 실패');
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 관리자: 로그아웃 */
async function adminLogout() {
  await fetch(`${API_BASE}/admin/logout`, { method: 'POST', credentials: 'include' });
}

/** 관리자: 인증 상태 확인 */
async function adminCheck() {
  try {
    const res = await fetch(`${API_BASE}/admin/check`, { credentials: 'include' });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.authenticated;
  } catch (e) {
    return false;
  }
}

/** 관리자: 전체 제출 목록 조회 (페이지네이션/검색/필터) */
async function fetchSubmissionsAdmin({ page = 1, limit = 20, nickname = '', wasteType = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (nickname) params.set('nickname', nickname);
  if (wasteType) params.set('waste_type', wasteType);
  const res = await fetch(`${API_BASE}/submissions?${params.toString()}`, { credentials: 'include' });
  if (res.status === 401) {
    const err = new Error('관리자 인증이 필요합니다.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) return { data: [], total: 0 };
  return await res.json();
}

/** 관리자: 레코드 삭제 */
async function deleteSubmission(id) {
  const res = await fetch(`${API_BASE}/submissions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (res.status === 401) {
    const err = new Error('관리자 인증이 필요합니다.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error('삭제 실패');
  return await res.json();
}

/** 관리자: 계산 데이터 엑셀 업로드 */
async function uploadWasteTypesExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/admin/waste-types/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error('관리자 인증이 필요합니다.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(json.error || '업로드 실패');
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 관리자: 현재 계산 데이터 조회 */
async function fetchAdminWasteTypes() {
  const res = await fetch(`${API_BASE}/admin/waste-types`, { credentials: 'include' });
  if (res.status === 401) {
    const err = new Error('관리자 인증이 필요합니다.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) return { data: [] };
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
