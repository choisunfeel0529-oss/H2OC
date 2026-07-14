import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
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
import adminHtml from '../public/admin.html?raw'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
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
app.get('/admin', (c) => c.html(adminHtml))

// ------------------------------------------------------------------
// 폐기물 종류 정의 (프론트와 동일한 계산 계수)
// ------------------------------------------------------------------
const WASTE_TYPES = [
  { code: 'pp', label: '플라스틱 (PP)', short: '플라스틱(PP)', carbonPerKg: 1.31, waterBase: 46 },
  { code: 'hdpe', label: '플라스틱 (HDPE)', short: '플라스틱(HDPE)', carbonPerKg: 1.45, waterBase: 50 },
  { code: 'pet', label: '플라스틱 (PET)', short: '플라스틱(PET)', carbonPerKg: 1.60, waterBase: 55 },
  { code: 'ldpe', label: '비닐 (LDPE)', short: '비닐(LDPE)', carbonPerKg: 1.20, waterBase: 40 },
  { code: 'paper', label: '종이', short: '종이', carbonPerKg: 0.90, waterBase: 35 },
  { code: 'can', label: '캔', short: '캔', carbonPerKg: 4.15, waterBase: 65 },
] as const

function getWasteType(code: string) {
  return WASTE_TYPES.find((w) => w.code === code) || null
}

function computeResult(code: string, weightG: number) {
  const type = getWasteType(code)
  if (!type) return null
  const weightKg = weightG / 1000
  const carbon = Math.round(type.carbonPerKg * weightKg * 100) / 100
  const water = Math.min(95, Math.round(type.waterBase * Math.sqrt(weightKg)))
  return { carbon_kg: carbon, water_percent: water }
}

function genId() {
  return crypto.randomUUID()
}

// ------------------------------------------------------------------
// API: 폐기물 종류 목록
// ------------------------------------------------------------------
app.get('/api/waste-types', (c) => {
  return c.json({ data: WASTE_TYPES })
})

// ------------------------------------------------------------------
// API: 닉네임 중복 확인
// GET /api/nickname-check?nickname=xxx
// ------------------------------------------------------------------
app.get('/api/nickname-check', async (c) => {
  const nickname = (c.req.query('nickname') || '').trim()
  if (!nickname) {
    return c.json({ error: '닉네임을 입력해주세요.' }, 400)
  }
  const row = await c.env.DB.prepare(
    'SELECT id FROM submissions WHERE nickname = ? LIMIT 1'
  )
    .bind(nickname)
    .first()
  return c.json({ taken: !!row })
})

// ------------------------------------------------------------------
// API: 제출 생성 (계산 + 저장)
// POST /api/submissions  { nickname, waste_type, weight_g }
// ------------------------------------------------------------------
app.post('/api/submissions', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '요청 본문이 올바르지 않습니다.' }, 400)

  const nickname = String(body.nickname || '').trim()
  const wasteCode = String(body.waste_type || '').trim()
  const weightG = Number(body.weight_g)

  if (!nickname) return c.json({ error: '닉네임을 입력해주세요.' }, 400)
  if (nickname.length > 20) return c.json({ error: '닉네임은 20자 이내로 입력해주세요.' }, 400)

  const wasteType = getWasteType(wasteCode)
  if (!wasteType) return c.json({ error: '유효하지 않은 폐기물 종류입니다.' }, 400)

  if (!Number.isFinite(weightG) || weightG <= 0) {
    return c.json({ error: '무게는 0보다 큰 숫자여야 합니다.' }, 400)
  }
  if (weightG > 1000000) {
    return c.json({ error: '무게 값이 너무 큽니다.' }, 400)
  }

  // 닉네임 중복 검사 (서버 사이드)
  const existing = await c.env.DB.prepare(
    'SELECT id FROM submissions WHERE nickname = ? LIMIT 1'
  )
    .bind(nickname)
    .first()
  if (existing) {
    return c.json({ error: '이미 사용 중인 닉네임입니다.' }, 409)
  }

  const result = computeResult(wasteCode, weightG)
  if (!result) return c.json({ error: '계산에 실패했습니다.' }, 400)

  const id = genId()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO submissions (id, nickname, waste_type, waste_label, weight_g, carbon_kg, water_percent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      nickname,
      wasteCode,
      wasteType.label,
      weightG,
      result.carbon_kg,
      result.water_percent,
      now,
      now
    )
    .run()

  return c.json({
    id,
    nickname,
    waste_type: wasteCode,
    waste_label: wasteType.label,
    weight_g: weightG,
    carbon_kg: result.carbon_kg,
    water_percent: result.water_percent,
    created_at: now,
  })
})

// ------------------------------------------------------------------
// API: 전체 제출 목록 (페이지네이션, 검색/필터 지원 - 관리자용)
// GET /api/submissions?page=1&limit=20&nickname=xxx&waste_type=pet
// ------------------------------------------------------------------
app.get('/api/submissions', async (c) => {
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
// API: 레코드 삭제 (관리자용)
// DELETE /api/submissions/:id
// ------------------------------------------------------------------
app.delete('/api/submissions/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
