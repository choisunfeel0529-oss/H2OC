import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import * as XLSX from 'xlsx'
// @ts-ignore - vite raw import
import homeHtml from '../public/index.html?raw'
// @ts-ignore - vite raw import
import loginHtml from '../public/login.html?raw'
// @ts-ignore - vite raw import
import selectHtml from '../public/select.html?raw'
// @ts-ignore - vite raw import
import weightHtml from '../public/weight.html?raw'
// @ts-ignore - vite raw import
import resultHtml from '../public/result.html?raw'
// @ts-ignore - vite raw import
import rankingHtml from '../public/ranking.html?raw'
// @ts-ignore - vite raw import
import statusHtml from '../public/status.html?raw'
// @ts-ignore - vite raw import
import adminHtml from '../public/admin.html?raw'

type Bindings = {
  DB: D1Database
  ADMIN_PASSWORD?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({ credentials: true, origin: (origin) => origin || '*' }))
app.use('/static/*', serveStatic({ root: './public' }))

// ------------------------------------------------------------------
// 페이지 라우트 (Cloudflare Pages가 .html 요청을 확장자 없는 경로로
// 자동 리다이렉트하므로, 워커에서 직접 각 페이지를 서빙한다)
// ------------------------------------------------------------------
app.get('/', (c) => c.html(homeHtml))
app.get('/login', (c) => c.html(loginHtml))
app.get('/select', (c) => c.html(selectHtml))
app.get('/weight', (c) => c.html(weightHtml))
app.get('/result', (c) => c.html(resultHtml))
app.get('/ranking', (c) => c.html(rankingHtml))
app.get('/status', (c) => c.html(statusHtml))
app.get('/admin', (c) => c.html(adminHtml))

// ==================================================================
// 관리자 인증 (쿠키 기반 서명 세션 - 서버 상태 저장 없이 검증)
// ==================================================================
const ADMIN_COOKIE = 'h2oc_admin_session'
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12시간
const DEFAULT_ADMIN_PASSWORD = 'h2oc2026!' // wrangler secret ADMIN_PASSWORD 로 운영 환경에서 재정의 권장

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let str = ''
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return atob(padded + pad)
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return b64url(sig)
}

async function createAdminToken(secret: string): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + ADMIN_SESSION_TTL_MS })
  const payloadB64 = b64url(new TextEncoder().encode(payload))
  const sig = await hmacSign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

async function verifyAdminToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts
  const expectedSig = await hmacSign(payloadB64, secret)
  if (expectedSig !== sig) return false
  try {
    const payload = JSON.parse(b64urlDecodeToString(payloadB64))
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

function getAdminSecret(c: any): string {
  return (c.env.ADMIN_PASSWORD && String(c.env.ADMIN_PASSWORD).trim()) || DEFAULT_ADMIN_PASSWORD
}

async function adminAuthMiddleware(c: any, next: () => Promise<void>) {
  const token = getCookie(c, ADMIN_COOKIE)
  const secret = getAdminSecret(c)
  const ok = await verifyAdminToken(token, secret)
  if (!ok) {
    return c.json({ error: '관리자 인증이 필요합니다.' }, 401)
  }
  await next()
}

// POST /api/admin/login { password }
app.post('/api/admin/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const password = String(body?.password || '')
  const secret = getAdminSecret(c)
  if (!password || password !== secret) {
    return c.json({ error: '비밀번호가 일치하지 않습니다.' }, 401)
  }
  const token = await createAdminToken(secret)
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  })
  return c.json({ success: true })
})

// POST /api/admin/logout
app.post('/api/admin/logout', async (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' })
  return c.json({ success: true })
})

// GET /api/admin/check - 현재 세션이 유효한지 확인 (관리자 페이지 진입 시 프롬프트 스킵용)
app.get('/api/admin/check', async (c) => {
  const token = getCookie(c, ADMIN_COOKIE)
  const secret = getAdminSecret(c)
  const ok = await verifyAdminToken(token, secret)
  return c.json({ authenticated: ok })
})

// ==================================================================
// 폐기물/계산 데이터 (엑셀 업로드 기반, D1 waste_types 테이블에서 관리)
// 엑셀 헤더: 품목 | 배출량(g) | 탄소 절감 계수 | 수자원 절감률(%) | 총 탄소 절감량(kg) | 수자원 절감 효과
// ------------------------------------------------------------------
type WasteTypeRow = {
  id: number
  code: string
  item_name: string
  carbon_factor: number
  water_percent: number | null
  water_label: string | null
  sort_order: number
}

async function getWasteTypeByCode(c: any, code: string): Promise<WasteTypeRow | null> {
  const row = await c.env.DB.prepare('SELECT * FROM waste_types WHERE code = ? LIMIT 1')
    .bind(code)
    .first<WasteTypeRow>()
  return row || null
}

function computeResultFromType(type: WasteTypeRow, weightG: number) {
  const weightKg = weightG / 1000
  // 엑셀 수식 그대로 반영: 총 탄소 절감량(kg) = (배출량(g)/1000) * 탄소 절감 계수
  const carbon = Math.round(type.carbon_factor * weightKg * 1000) / 1000
  // 수자원 절감률은 엑셀에 정의된 품목별 고정 값(숫자) 또는 텍스트 라벨을 그대로 사용
  return {
    carbon_kg: carbon,
    water_percent: type.water_percent,
    water_label: type.water_label,
  }
}

function genId() {
  return crypto.randomUUID()
}

// GET /api/waste-types - 폐기물 종류 목록 (엑셀에서 매핑된 최신 데이터)
app.get('/api/waste-types', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM waste_types ORDER BY sort_order ASC, id ASC'
  ).all<WasteTypeRow>()
  return c.json({ data: results })
})

// ------------------------------------------------------------------
// 관리자: 계산 데이터 엑셀 업로드 (헤더명 기준 매핑, 2행부터 마지막 행까지 자동 반영)
// POST /api/admin/waste-types/upload  (multipart/form-data, field name: file)
// ------------------------------------------------------------------
function normalizeHeader(h: unknown): string {
  return String(h ?? '').replace(/\s+/g, '').trim()
}

// 주의: "수자원 절감 효과"는 엑셀에서 수식으로 생성된 표시용 텍스트 컬럼(예: "46%절감")이므로
// 여기서 매핑 대상으로 포함하면 안 된다. 실제 계산에 사용할 숫자 컬럼은 "수자원 절감률(%)" 뿐이다.
const HEADER_ALIASES: Record<string, string[]> = {
  item: ['품목'],
  carbonFactor: ['탄소절감계수', '탄소절감계수(kg/kg)'],
  waterPercent: ['수자원절감률(%)', '수자원절감률'],
}

app.post('/api/admin/waste-types/upload', adminAuthMiddleware, async (c) => {
  const formData = await c.req.formData().catch(() => null)
  if (!formData) return c.json({ error: '요청 형식이 올바르지 않습니다.' }, 400)

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: '엑셀 파일을 첨부해주세요.' }, 400)
  }

  const buffer = await (file as File).arrayBuffer()
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch (e) {
    return c.json({ error: '엑셀 파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해주세요.' }, 400)
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return c.json({ error: '엑셀 시트를 찾을 수 없습니다.' }, 400)

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  if (!rows.length) return c.json({ error: '엑셀 데이터가 비어 있습니다.' }, 400)

  // 1행: 헤더(컬럼명) - 컬럼 위치가 아닌 헤더명으로 인덱스를 찾는다
  const headerRow = rows[0]
  const colIndex: Record<string, number> = {}
  headerRow.forEach((h, idx) => {
    const norm = normalizeHeader(h)
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        colIndex[key] = idx
      }
    }
  })

  if (colIndex.item === undefined || colIndex.carbonFactor === undefined) {
    return c.json(
      {
        error:
          '필수 컬럼(품목, 탄소 절감 계수)을 엑셀 헤더에서 찾을 수 없습니다. 1행이 컬럼명인지 확인해주세요.',
      },
      400
    )
  }

  // 2행부터 마지막 행까지가 실제 데이터
  const dataRows = rows.slice(1)
  const parsed: {
    code: string
    item_name: string
    carbon_factor: number
    water_percent: number | null
    water_label: string | null
    sort_order: number
  }[] = []

  let sortOrder = 0
  for (const row of dataRows) {
    const itemNameRaw = row[colIndex.item]
    const itemName = itemNameRaw === null || itemNameRaw === undefined ? '' : String(itemNameRaw).trim()
    if (!itemName) continue // 빈 행은 스킵

    const carbonRaw = row[colIndex.carbonFactor]
    const carbonFactor = Number(carbonRaw)
    if (!Number.isFinite(carbonFactor)) continue // 탄소 계수가 없는 행은 계산 불가하므로 스킵

    let waterPercent: number | null = null
    let waterLabel: string | null = null
    if (colIndex.waterPercent !== undefined) {
      const waterRaw = row[colIndex.waterPercent]
      const waterNum = Number(waterRaw)
      if (waterRaw !== null && waterRaw !== undefined && waterRaw !== '' && Number.isFinite(waterNum)) {
        waterPercent = waterNum
      } else if (waterRaw !== null && waterRaw !== undefined && String(waterRaw).trim() !== '') {
        waterLabel = String(waterRaw).trim()
      }
    }

    sortOrder += 1
    parsed.push({
      code: `item_${sortOrder}`,
      item_name: itemName,
      carbon_factor: carbonFactor,
      water_percent: waterPercent,
      water_label: waterLabel,
      sort_order: sortOrder,
    })
  }

  if (!parsed.length) {
    return c.json({ error: '유효한 데이터 행을 찾지 못했습니다. (2행부터 마지막 행까지 확인)' }, 400)
  }

  // 기존 계산 데이터를 새 엑셀 내용으로 교체
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM waste_types'),
    ...parsed.map((p) =>
      c.env.DB.prepare(
        `INSERT INTO waste_types (code, item_name, carbon_factor, water_percent, water_label, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(p.code, p.item_name, p.carbon_factor, p.water_percent, p.water_label, p.sort_order)
    ),
  ])

  return c.json({ success: true, count: parsed.length, data: parsed })
})

// 관리자: 현재 계산 데이터 조회 (엑셀 매핑 확인용)
app.get('/api/admin/waste-types', adminAuthMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM waste_types ORDER BY sort_order ASC, id ASC'
  ).all<WasteTypeRow>()
  return c.json({ data: results })
})

// ==================================================================
// 닉네임 / 디바이스 식별
// ==================================================================

// GET /api/nickname-check?nickname=xxx&device_id=yyy
// 동일 device_id가 이미 사용 중인 닉네임이면 '중복 아님'으로 처리 (재접속 허용)
app.get('/api/nickname-check', async (c) => {
  const nickname = (c.req.query('nickname') || '').trim()
  const deviceId = (c.req.query('device_id') || '').trim()
  if (!nickname) {
    return c.json({ error: '닉네임을 입력해주세요.' }, 400)
  }

  let row
  if (deviceId) {
    row = await c.env.DB.prepare(
      `SELECT id FROM submissions WHERE nickname = ? AND (device_id IS NULL OR device_id != ?) LIMIT 1`
    )
      .bind(nickname, deviceId)
      .first()
  } else {
    row = await c.env.DB.prepare('SELECT id FROM submissions WHERE nickname = ? LIMIT 1')
      .bind(nickname)
      .first()
  }
  return c.json({ taken: !!row })
})

// GET /api/device-nickname?device_id=xxx
// 이 디바이스가 이전에 사용한 닉네임을 반환 (있으면 로그인 화면을 건너뛰고 재사용)
app.get('/api/device-nickname', async (c) => {
  const deviceId = (c.req.query('device_id') || '').trim()
  if (!deviceId) return c.json({ nickname: null })

  const row = await c.env.DB.prepare(
    `SELECT nickname FROM submissions WHERE device_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(deviceId)
    .first<{ nickname: string }>()

  return c.json({ nickname: row?.nickname || null })
})

// ------------------------------------------------------------------
// API: 제출 생성 (계산 + 저장)
// POST /api/submissions  { nickname, waste_type, weight_g, device_id }
// ------------------------------------------------------------------
app.post('/api/submissions', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '요청 본문이 올바르지 않습니다.' }, 400)

  const nickname = String(body.nickname || '').trim()
  const wasteCode = String(body.waste_type || '').trim()
  const weightG = Number(body.weight_g)
  const deviceId = body.device_id ? String(body.device_id).trim() : null

  if (!nickname) return c.json({ error: '닉네임을 입력해주세요.' }, 400)
  if (nickname.length > 20) return c.json({ error: '닉네임은 20자 이내로 입력해주세요.' }, 400)

  const wasteType = await getWasteTypeByCode(c, wasteCode)
  if (!wasteType) return c.json({ error: '유효하지 않은 폐기물 종류입니다.' }, 400)

  if (!Number.isFinite(weightG) || weightG <= 0) {
    return c.json({ error: '무게는 0보다 큰 숫자여야 합니다.' }, 400)
  }
  if (weightG > 1000000) {
    return c.json({ error: '무게 값이 너무 큽니다.' }, 400)
  }

  // 닉네임 중복 검사 (서버 사이드) - 동일 device_id의 재사용은 허용
  let existing
  if (deviceId) {
    existing = await c.env.DB.prepare(
      `SELECT id FROM submissions WHERE nickname = ? AND (device_id IS NULL OR device_id != ?) LIMIT 1`
    )
      .bind(nickname, deviceId)
      .first()
  } else {
    existing = await c.env.DB.prepare('SELECT id FROM submissions WHERE nickname = ? LIMIT 1')
      .bind(nickname)
      .first()
  }
  if (existing) {
    return c.json({ error: '이미 사용 중인 닉네임입니다.' }, 409)
  }

  const result = computeResultFromType(wasteType, weightG)

  const id = genId()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO submissions (id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, water_label, device_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      nickname,
      wasteType.code,
      wasteType.item_name,
      weightG,
      result.carbon_kg,
      result.water_percent,
      result.water_label,
      deviceId,
      now,
      now
    )
    .run()

  return c.json({
    id,
    nickname,
    waste_type: wasteType.code,
    waste_label: wasteType.item_name,
    weight_g: weightG,
    carbon_kg: result.carbon_kg,
    water_percent: result.water_percent,
    water_label: result.water_label,
    created_at: now,
  })
})

// ------------------------------------------------------------------
// API: 전체 제출 목록 (페이지네이션, 검색/필터 지원 - 관리자용) [보호됨]
// GET /api/submissions?page=1&limit=20&nickname=xxx&waste_type=pet
// ------------------------------------------------------------------
app.get('/api/submissions', adminAuthMiddleware, async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '20', 10)))
  const offset = (page - 1) * limit
  const nickname = c.req.query('nickname')
  const wasteType = c.req.query('waste_type')

  const conditions: string[] = []
  const params: any[] = []
  if (nickname) {
    conditions.push('nickname LIKE ?')
    params.push(`%${nickname}%`)
  }
  if (wasteType) {
    conditions.push('waste_type = ?')
    params.push(wasteType)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM submissions ${whereClause}`
  )
    .bind(...params)
    .first<{ cnt: number }>()
  const total = totalRow?.cnt || 0

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM submissions ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all()

  return c.json({ data: results, total, page, limit })
})

// ------------------------------------------------------------------
// API: 랭킹 (Top N + 요약 통계)
// GET /api/ranking?limit=100
// ------------------------------------------------------------------
app.get('/api/ranking', async (c) => {
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '100', 10)))

  const summaryRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as participant_count,
            COALESCE(SUM(carbon_kg), 0) as total_carbon_kg,
            COALESCE(AVG(water_percent), 0) as avg_water_percent,
            COALESCE(SUM(weight_g), 0) as total_weight_g
     FROM submissions`
  ).first<{
    participant_count: number
    total_carbon_kg: number
    avg_water_percent: number
    total_weight_g: number
  }>()

  // 랭킹은 닉네임별 최고 탄소 저감량 합산 기준 (동일 닉네임 여러 제출 시 합산)
  const { results } = await c.env.DB.prepare(
    `SELECT nickname,
            SUM(carbon_kg) as carbon_kg,
            AVG(water_percent) as water_percent,
            SUM(weight_g) as weight_g,
            COUNT(*) as submit_count,
            MAX(created_at) as last_submitted_at
     FROM submissions
     GROUP BY nickname
     ORDER BY carbon_kg DESC
     LIMIT ?`
  )
    .bind(limit)
    .all()

  return c.json({
    summary: {
      participant_count: summaryRow?.participant_count || 0,
      total_carbon_kg: Math.round((summaryRow?.total_carbon_kg || 0) * 100) / 100,
      avg_water_percent: Math.round(summaryRow?.avg_water_percent || 0),
      total_weight_g: summaryRow?.total_weight_g || 0,
    },
    ranking: results,
  })
})

// ------------------------------------------------------------------
// API: 특정 닉네임의 순위 조회
// GET /api/ranking/me?nickname=xxx
// ------------------------------------------------------------------
app.get('/api/ranking/me', async (c) => {
  const nickname = (c.req.query('nickname') || '').trim()
  if (!nickname) return c.json({ error: '닉네임이 필요합니다.' }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT nickname, SUM(carbon_kg) as carbon_kg, AVG(water_percent) as water_percent,
            SUM(weight_g) as weight_g, COUNT(*) as submit_count
     FROM submissions
     GROUP BY nickname
     ORDER BY carbon_kg DESC`
  ).all<{ nickname: string; carbon_kg: number }>()

  const idx = results.findIndex((r) => r.nickname === nickname)
  if (idx === -1) {
    return c.json({ found: false })
  }
  return c.json({ found: true, rank: idx + 1, total: results.length, data: results[idx] })
})

// ------------------------------------------------------------------
// API: 레코드 삭제 (관리자용) [보호됨]
// DELETE /api/submissions/:id
// ------------------------------------------------------------------
app.delete('/api/submissions/:id', adminAuthMiddleware, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
