/**
 * 人生看板 · 宿主半（M1：健康 + 任务）
 *
 * 职责：
 *  - 只读 vault 文件（life/log/*.md、TODO.md），折叠成板块微统计
 *  - 通过 connection.fetch.register 暴露 POST /api/lifeboard/board
 *  - 按 mtime 缓存解析结果，不轮询、不写入数据源
 *
 * 技术取舍（对照任务书 §三）：
 *  未走 Typert @Remote（需 TS + 构建链），改用与 dsh-context 相同的
 *  connection 路由 + 同域 fetch；数据形态与「Remote 宿主方法」等价，
 *  后续 M2 如需会话身份再迁 @Remote。
 */
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const name = 'dsh-lifeboard'

/**
 * 可配置路径（2026-11-09 上架改造）：全部相对 vault 根，任何一项都能在 row config 覆盖。
 * 缺文件时对应卡片降级为「暂无数据」，不抛错。
 */
export const DEFAULT_PATHS = {
  logDir: '_assistant/life/log',
  todoFile: '_assistant/TODO.md',
  assetsFile: '_assistant/life/private/资产快照.tsv',
  financeFile: '_assistant/life/private/消费流水.tsv',
  shelfDir: '_assistant/notes/书架',
  coverDir: '_assistant/life/private/书/封面',
  excerptDir: '_assistant/life/private/书/抽取',
  backupDir: '_assistant/.backup',
}
let PATHS = { ...DEFAULT_PATHS }
let USER_SETTINGS = {}
/** 运行时生效配置：默认 ← row config ← 设置页保存；board/settings 都读它 */
let RUNTIME_CONFIG = {}
/** 配置版本号：设置一改就 +1，让 vault 根缓存失效（否则切演示/换路径读的还是老目录） */
let CONFIG_EPOCH = 0

const SETTINGS_KEYS = ['vaultRoot', 'logDir', 'todoFile', 'assetsFile', 'financeFile', 'shelfDir', 'coverDir', 'excerptDir', 'backupDir', 'windowDays', 'proteinTarget', 'proteinTolerance', 'fatGoalKg', 'cards', 'demoMode', 'demoCoverDir', 'einkEnable', 'einkPort', 'einkKindleDir']

function settingsFile() {
  return path.join(process.env.HOME || '', '.dsh', 'storages', 'dsh-lifeboard', 'settings.json')
}

async function readUserSettings() {
  try {
    const raw = JSON.parse(await readFile(settingsFile(), 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

async function writeUserSettings(values) {
  const dir = path.dirname(settingsFile())
  await mkdir(dir, { recursive: true })
  const clean = {}
  for (const key of SETTINGS_KEYS) {
    if (values?.[key] !== undefined) clean[key] = values[key]
  }
  await writeFile(settingsFile(), JSON.stringify(clean, null, 2), 'utf8')
  USER_SETTINGS = clean
  applySettings(clean)
  // 立即反映到运行时配置：卡片开关 / 窗口 / 阈值都不必重启
  RUNTIME_CONFIG = { ...RUNTIME_CONFIG, ...clean }
  CONFIG_EPOCH += 1
  // 打开示例预览时当场生成示例数据，省一次重启
  if (clean.demoMode === true) {
    try {
      const { ensureDemoVault } = await import('./demo-data.mjs')
      await ensureDemoVault(path.join(process.env.HOME || '', '.dsh', 'storages', 'dsh-lifeboard', 'demo-vault'), mergedConfig.demoCoverDir || '')
    } catch { /* 生成失败就降级为无数据 */ }
  }
  return clean
}

/** 把一份设置应用到运行时（路径 / 卡片 / e-ink 端口等） */
function applySettings(settings) {
  if (settings?.demoMode === true) {
    PATHS = { ...DEFAULT_PATHS }
    return
  }
  for (const key of Object.keys(DEFAULT_PATHS)) {
    const v = settings?.[key]
    if (typeof v === 'string' && v.trim() !== '') PATHS[key] = v.trim()
  }
  if (Number.isFinite(settings?.proteinTarget)) cfgProteinTarget = settings.proteinTarget
  if (Number.isFinite(settings?.proteinTolerance)) cfgProteinTolerance = settings.proteinTolerance
  if (Number.isFinite(settings?.fatGoalKg)) cfgFatGoalKg = settings.fatGoalKg
}
/** 配置 schema：Schemastery 可选（缺依赖时退回原始透传，不阻塞激活） */
async function loadConfigSchema() {
  try {
    const mod = await import('@deepseek-ai/schemastery')
    const z = mod?.default ?? mod
    if (typeof z?.object !== 'function') return undefined
    const cards = z.object({
      health: z.boolean().default(true),
      tasks: z.boolean().default(true),
      assets: z.boolean().default(true),
      mood: z.boolean().default(true),
      shelf: z.boolean().default(true),
    })
    return z.object({
      vaultRoot: z.string().default(''),
      logDir: z.string().default(DEFAULT_PATHS.logDir),
      todoFile: z.string().default(DEFAULT_PATHS.todoFile),
      assetsFile: z.string().default(DEFAULT_PATHS.assetsFile),
      financeFile: z.string().default(DEFAULT_PATHS.financeFile),
      shelfDir: z.string().default(DEFAULT_PATHS.shelfDir),
      coverDir: z.string().default(DEFAULT_PATHS.coverDir),
      excerptDir: z.string().default(DEFAULT_PATHS.excerptDir),
      backupDir: z.string().default(DEFAULT_PATHS.backupDir),
      windowDays: z.number().default(7),
      proteinTarget: z.number().default(130),
      proteinTolerance: z.number().default(10),
      fatGoalKg: z.number().default(6.1),
      cards,
      demoMode: z.boolean().default(false),
      demoCoverDir: z.string().default(''),
      einkEnable: z.boolean().default(false),
      einkPort: z.number().default(8788),
      einkKindleDir: z.string().default(''),
    })
  } catch {
    return undefined
  }
}

export const Config = await loadConfigSchema()

export const inject = ['connection']

// 配置（无 Schemastery 依赖，走原始 config 透传；cordis.patch.yml row config 可覆盖）：
//   vaultRoot: string        默认 '' = 自动取 workingDirectory.defaultDirectory
//   healthWindowDays: number 默认 7 = 健康板块回看天数

// ---------- 工具 ----------

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/
const pad = (n) => String(n).padStart(2, '0')
/** 全角数字/句点 → 半角：手打日志里常见「７２．５」（2026-11-10 容错） */
const pathExists = async (abs) => { try { await stat(abs); return true } catch { return false } }
const normalizeDigits = (text) => String(text).replace(/[０-９．]/g, (c) =>
  c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 从「2026-11-04 上午」这类串里取 YYYY-MM-DD */
function pickDate(text) {
  const m = DATE_RE.exec(text)
  return m ? m[0] : null
}

// ---------- 数据折叠 ----------

const logCache = new Map() // file -> { mtimeMs, day }
let cfgProteinTarget = 130 // 可在 row config 用 proteinTarget 覆盖
let cfgProteinTolerance = 0.05 // 达标容差（130 × 0.95 ≈ 124g 起算）
let cfgFatGoalKg = 6.1 // 可在 row config 用 fatGoalKg 覆盖
let todoCache = null // { mtimeMs, value }

function sectionsOf(markdown) {
  const lines = markdown.split(/\r?\n/)
  // 正常按二级标题切；整篇一个 ## 都没有时，退回任意级别（### 健康 / # 健康 也认）
  const hasH2 = lines.some((l) => /^##(?!#)\s+/.test(l))
  const head = hasH2 ? /^##(?!#)\s+(.+?)\s*$/ : /^#{1,4}\s+(.+?)\s*$/
  const map = new Map()
  let current = ''
  for (const line of lines) {
    const h = head.exec(line)
    if (h) {
      current = h[1]
      if (!map.has(current)) map.set(current, '')
      continue
    }
    if (current !== '') map.set(current, (map.get(current) ?? '') + line + '\n')
  }
  return map
}

function tableCell(sectionText, label) {
  for (const line of sectionText.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '' && !/^:?-+:?$/.test(c))
    if (cells.length < 2) continue
    if (!cells[0].replace(/\*/g, '').includes(label)) continue
    const m = /(\d+(?:\.\d+)?)/.exec(cells[1].replace(/\*/g, ''))
    const note = cells[2] ? cells[2].replace(/\*/g, '').trim() : ''
    return { value: m ? Number(m[1]) : null, note }
  }
  return { value: null, note: '' }
}

const tableMetric = (sectionText, label) => tableCell(sectionText, label).value

function foldDay(date, markdown) {
  markdown = normalizeDigits(markdown).replace(/^\uFEFF/, '')
  const sections = sectionsOf(markdown)
  const health = [...sections.entries()].find(([k]) => k.startsWith('健康'))?.[1] ?? ''
  const sleep = [...sections.entries()].find(([k]) => k.startsWith('睡眠'))?.[1] ?? ''
  const sports = [...sections.entries()].find(([k]) => k.startsWith('运动'))?.[1] ?? ''

  // 睡眠：7.5 小时 / 7.5h / 7.5 hours 都认（2026-11-10 容错）
  const sleepMatch = /(\d+(?:\.\d+)?)\s*(?:小时|个?h(?:ours?|rs?)?(?![a-z]))/i.exec(sleep)
  const exercised = sports.split(/\r?\n/).some((l) => l.trim().startsWith('-') && l.trim().length > 1)
  // 距离：兼容 km 与 m（如「室内步行 874 m」），并剔除「爬升 46m」这类高度写法（2026-11-09 修）
  let exerciseKm = null
  for (const line of sports.split(/\r?\n/)) {
    if (!line.trim().startsWith('-')) continue
    const cleaned = line.replace(/爬升\s*\d+(?:\.\d+)?\s*m/gi, '')
    const kmHit = /(\d+(?:\.\d+)?)\s*km/i.exec(cleaned)
    if (kmHit) {
      exerciseKm = (exerciseKm ?? 0) + Number(kmHit[1])
      continue
    }
    const mHit = /(\d+(?:\.\d+)?)\s*m(?![a-z])/i.exec(cleaned)
    if (mHit && /步行|跑步|跑了|骑行|游泳|越野|徒步/.test(cleaned)) {
      exerciseKm = (exerciseKm ?? 0) + Number(mHit[1]) / 1000
    }
  }

  const moodSection = [...sections.entries()].find(([k]) => k.startsWith('情绪'))?.[1] ?? ''
  const moodLine = moodSection.split(/\r?\n/).find((l) => l.trim().startsWith('-'))
  const moodText = moodLine
    ? cleanTitle(moodLine.replace(/^-\s*/, '').replace(/（[^）]*(\d{1,2}:\d{2}|口述|实拍)[^）]*）/g, '')).slice(0, 24)
    : null

  const boneSalt = tableCell(health, '骨盐率')
  return {
    date,
    weightKg: tableMetric(health, '体重'),
    visceralFat: tableMetric(health, '内脏脂肪'),
    bodyFat: tableMetric(health, '体脂率'),
    boneSalt: boneSalt.value,
    boneSaltNote: boneSalt.note,
    heartRate: tableMetric(health, '心率'),
    bmi: tableMetric(health, 'BMI'),
    sleepHours: sleepMatch ? Number(sleepMatch[1]) : null,
    exercised,
    exerciseKm: exerciseKm === null ? null : Math.round(exerciseKm * 1000) / 1000,
    moodText,
    protein: foldProtein(markdown),
  }
}

async function readLogDay(vaultRoot, date) {
  const file = path.join(vaultRoot, PATHS.logDir, `${date}.md`)
  let mtimeMs
  try {
    mtimeMs = (await stat(file)).mtimeMs
  } catch {
    return null
  }
  const cached = logCache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.day
  let day = null
  try {
    day = foldDay(date, await readFile(file, 'utf8'))
  } catch {
    day = null
  }
  logCache.set(file, { mtimeMs, day })
  return day
}

async function foldHealth(vaultRoot, windowDays) {
  const days = []
  const now = new Date()
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const day = await readLogDay(vaultRoot, dayKey(d))
    if (day) days.push(day)
  }
  if (days.length === 0) {
    const dirAbs = path.join(vaultRoot, PATHS.logDir)
    return { available: false, hint: { code: (await pathExists(dirAbs)) ? 'no-recent' : 'no-file', path: dirAbs } }
  }

  const withWeight = days.filter((d) => d.weightKg !== null)
  const latest = days[0]
  const previous = withWeight.find((d) => d.date !== latest.date && d.weightKg !== null)
  const sleepDays = days.filter((d) => d.sleepHours !== null)
  const sleepAvg = sleepDays.length
    ? Math.round((sleepDays.reduce((s, d) => s + (d.sleepHours ?? 0), 0) / sleepDays.length) * 10) / 10
    : null

  const formatHint = latest.weightKg === null
    ? { code: 'format', path: path.join(vaultRoot, PATHS.logDir, `${latest.date}.md`), detail: '体重 / 体脂率' }
    : undefined
  return {
    available: true,
    hint: formatHint,
    date: latest.date,
    weightKg: latest.weightKg,
    weightDelta: latest.weightKg !== null && previous?.weightKg != null
      ? Math.round((latest.weightKg - previous.weightKg) * 10) / 10
      : null,
    visceralFat: latest.visceralFat,
    sleepAvgHours: sleepAvg,
    sleepDays: sleepDays.length,
    exerciseDays: days.filter((d) => d.exercised).length,
    vitals: {
      bodyFat: latest.bodyFat,
      visceralFat: latest.visceralFat,
      boneSalt: latest.boneSalt,
      boneSaltWarn: /不足|偏低/.test(latest.boneSaltNote ?? ''),
      heartRate: latest.heartRate,
      bmi: latest.bmi,
    },
    protein: (() => {
      const target = cfgProteinTarget
      const week = [...days].reverse().map((d) => ({
        date: d.date,
        grams: d.protein?.grams ?? null,
        partial: d.protein?.partial ?? false,
      }))
      const logged = week.filter((d) => d.grams !== null)
      const full = logged.filter((d) => !d.partial)
      const today = week.find((d) => d.date === dayKey(new Date())) ?? null
      const threshold = Math.round(target * (1 - cfgProteinTolerance))
      return {
        target,
        threshold,
        today,
        week,
        hitDays: full.filter((d) => d.grams >= threshold).length,
        fullDays: full.length,
        partialDays: logged.length - full.length,
        loggedDays: logged.length,
      }
    })(),
    goal: await (async () => {
      const fatGoal = cfgFatGoalKg
      const latestW = latest.weightKg
      if (latestW === null) return null
      // 起点优先取窗口外更早的体重（真·基线），否则退窗口内最早一次
      let startW = null
      for (let i = windowDays; i < 60; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const day = await readLogDay(vaultRoot, dayKey(d))
        if (day && day.weightKg !== null) { startW = day.weightKg; break }
      }
      if (startW === null) {
        for (const d of [...days].reverse()) if (d.weightKg !== null) { startW = d.weightKg; break }
      }
      if (startW === null) return null
      const lost = Math.round((startW - latestW) * 10) / 10
      return { fatGoal, startWeight: startW, currentWeight: latestW, lost, progress: Math.max(0, Math.min(1, lost / fatGoal)) }
    })(),
    mood: (() => {
      const week = [...days].reverse().map((d) => ({ date: d.date, logged: d.moodText !== null }))
      let streak = 0
      for (let k = week.length - 1; k >= 0; k--) {
        if (week[k].logged) streak += 1
        else break
      }
      return {
        days: week,
        loggedDays: week.filter((d) => d.logged).length,
        streak,
        latest: days.find((d) => d.moodText !== null)?.moodText ?? null,
      }
    })(),
    moodDays: days.filter((d) => d.moodText !== null).length,
    moodLatest: days.find((d) => d.moodText !== null)?.moodText ?? null,
    weekKm: Math.round(days.reduce((sum, d) => sum + (d.exerciseKm ?? 0), 0) * 100) / 100,
    src: `_assistant/life/log/${latest.date}.md`,
    // 近 N 天序列（时间正序），供客户端画迷你趋势，不暴露给任何远端
    series: [...days].reverse().map((d) => ({
      date: d.date,
      weightKg: d.weightKg,
      sleepHours: d.sleepHours,
      exercised: d.exercised,
    })),
  }
}

/** 去掉 TODO 条目标题里的 Markdown 标记与多余空白，只留可读文本 */
function cleanTitle(raw) {
  return raw
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 每日蛋白：优先「全天蛋白」行；其次「累计」行的当日累计；否则按「估算」行求和 */
function foldProtein(markdown) {
  markdown = normalizeDigits(markdown)
  // 全文扫描：晚餐块可能被追加到任意段落下（实测 11-03 落在「运动」段后），
  // 只认饮食段会漏掉「全天蛋白」总账。蛋白质率等体征行已排除。
  const lines = markdown.split(/\r?\n/)
  // partial=true 表示当日只记到某一餐（全天值未知），不能拿来判「达标/未达标」
  const totalLine = lines.find((l) => l.includes('全天蛋白'))
  if (totalLine) {
    const range = /(\d+)\s*[–~-]\s*(\d+)\s*g/.exec(totalLine)
    if (range) return { grams: Math.round((Number(range[1]) + Number(range[2])) / 2), partial: false }
    const approx = /≈\s*\**~?(\d+)\s*g/.exec(totalLine)
    if (approx) return { grams: Number(approx[1]), partial: false }
    const grams = [...totalLine.matchAll(/(\d+)\s*g/g)].map((x) => Number(x[1]))
    if (grams.length > 0) return { grams: grams[grams.length - 1], partial: false }
    return null
  }
  // 只认「今日累计」日终账（「截至午餐累计」等中间账会让旧逻辑取错行）；
  // 取「蛋白」后第一个克数（行尾「距目标差 ~11g」这类数字不能当总量）
  const dayTotals = lines.filter((l) => l.includes('今日累计') && l.includes('蛋白'))
  if (dayTotals.length > 0) {
    const last = dayTotals[dayTotals.length - 1]
    const m = /蛋白\s*\**\s*[~≈]?\s*\**(\d+(?:\.\d+)?)\s*g/.exec(last)
    // 「日终 / 终版 / 闭账」这类算当日定稿，可参与达标统计；其余仍算 partial（2026-11-09 修）
    if (m) return { grams: Math.round(Number(m[1])), partial: !/日终|终版|闭账/.test(last) }
  }
  // 2026-11-09 修：先认「XX 合计：蛋白 ~27g」这类**每餐合计行**。
  // 旧逻辑跳过了所有含「热量」的行，而合计行两样都写 ⇒ 合计被跳过、只剩分项里第一个数（12g），严重少算。
  const mealTotals = lines.filter((l) => l.includes('合计') && l.includes('蛋白') && !l.includes('今日累计') && !l.includes('全天'))
  if (mealTotals.length > 0) {
    let totalSum = 0
    for (const l of mealTotals) {
      const m = /蛋白\s*\**\s*[~≈]?\s*\**(\d+(?:\.\d+)?)\s*g/.exec(l)
      if (m) totalSum += Number(m[1])
    }
    if (totalSum > 0) return { grams: Math.round(totalSum), partial: true }
  }
  let sum = 0
  let found = false
  const NUM = '(\\d+(?:\\.\\d+)?)'
  for (const line of lines) {
    if (!line.includes('估算') || !line.includes('蛋白')) continue
    if (line.includes('对比') || line.includes('累计') || line.includes('热量') || line.includes('蛋白质率') || line.includes('合计')) continue
    // 区间内「蛋白 a–b g」取中
    const range = new RegExp('蛋白[^≈\\n]*?' + NUM + '\\s*[–~-]\\s*' + NUM + '\\s*g').exec(line)
    if (range) { sum += Math.round((Number(range[1]) + Number(range[2])) / 2); found = true; continue }
    // 一行可能多段「蛋白 Xg」（如分项估算），全部累加；支持小数
    const segs = [...line.matchAll(new RegExp('蛋白[^≈\\n]*?(' + NUM + ')\\s*g', 'g'))]
    if (segs.length > 0) { sum += segs.reduce((a, x) => a + Number(x[1]), 0); found = true }
  }
  return found ? { grams: Math.round(sum), partial: true } : null
}

function shiftDay(key, deltaDays) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(y, m - 1, d + deltaDays)
  return dayKey(t)
}

const WORK_TAGS = ['出差', '续费', '标书', '合泰', '项目', '投标', '演示', '市场', '酒店', '工作', '打印', '寄送', '对接', '验收']
const LIFE_TAGS = ['家庭', '健康', '备孕', '出行', '生活', 'Kindle', '设备', '副业', '学习']

/** 按 #标签 粗分工作/生活；无匹配默认生活（个人事务居多） */
function classifyGroup(line) {
  const tags = [...line.matchAll(/#([^\s#|]+)/g)].map((m) => m[1])
  const hit = (dict) => tags.some((t) => dict.some((d) => t.includes(d) || d.includes(t)))
  if (hit(WORK_TAGS)) return 'work'
  if (hit(LIFE_TAGS)) return 'life'
  return 'life'
}

function foldTodo(markdown) {
  markdown = String(markdown).replace(/^\uFEFF/, '')
  const open = []
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^- \[ \]/.test(line)) continue
    const body = line.replace(/^- \[ \]\s*/, '')
    const title = cleanTitle(body.split('|')[0])
    const date = pickDate(body)
    open.push({ title, date, raw: line, group: classifyGroup(line) })
  }
  const today = dayKey(new Date())
  const weekEdge = shiftDay(today, 7)
  const dated = open
    .filter((i) => i.date !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const MAX_PER_GROUP = 6
  const grouped = { work: [], life: [] }
  for (const i of dated) grouped[i.group === 'work' ? 'work' : 'life'].push(i)
  return {
    available: true,
    openCount: open.length,
    undatedCount: open.length - dated.length,
    overdueCount: dated.filter((i) => i.date < today).length,
    dueThisWeek: dated.filter((i) => i.date >= today && i.date <= weekEdge).length,
    workCount: grouped.work.length,
    lifeCount: grouped.life.length,
    items: [...grouped.work, ...grouped.life].slice(0, MAX_PER_GROUP * 2).map((i) => ({
      title: i.title,
      date: i.date,
      overdue: i.date < today,
      group: i.group,
      raw: i.raw,
    })),
    moreCount: Math.max(0, dated.length - MAX_PER_GROUP * 2),
    src: PATHS.todoFile,
  }
}

async function foldTasks(vaultRoot) {
  const file = path.join(vaultRoot, PATHS.todoFile)
  let mtimeMs
  try {
    mtimeMs = (await stat(file)).mtimeMs
  } catch {
    return { available: false, hint: { code: 'no-file', path: file } }
  }
  if (todoCache && todoCache.mtimeMs === mtimeMs) return todoCache.value
  let value
  try {
    value = foldTodo(await readFile(file, 'utf8'))
  } catch {
    value = { available: false }
  }
  todoCache = { mtimeMs, value }
  return value
}

// ---------- 财务（消费流水.tsv） ----------

/** 不计入「生活支出」的类别：定投/转账/收入/退款 不算花钱 */
const NON_SPEND = ['投资', '转账', '收入', '退款', '还款']
/** 外食/外卖口径 */
const EAT_OUT = ['外食', '外卖', '餐饮']

let financeCache = null // { mtimeMs, value }

function parseMoney(text) {
  const n = Number(String(text ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function foldFinance(markdown) {
  const lines = markdown.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return { available: false }
  const header = lines[0].split('\t').map((c) => c.trim())
  const idx = (name) => header.findIndex((h) => h.includes(name))
  const iDate = idx('日期')
  const iCat = idx('类别')
  const iAmt = idx('金额')
  const iChannel = idx('渠道')
  const iNote = idx('备注')
  const now = new Date()
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  let monthSpend = 0
  let monthInvest = 0
  let eatOut = 0
  let latest = null
  let monthRows = 0
  let investTotal = 0
  let investCount = 0
  let lastInvestDate = null
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const date = (cells[iDate] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const category = (cells[iCat] ?? '').trim()
    const amount = parseMoney(cells[iAmt])
    const channel = (cells[iChannel] ?? '').trim()
    const note = (cells[iNote] ?? '').trim()
    if (latest === null || date > latest.date) latest = { date, category, amount, channel, note }
    if (NON_SPEND.some((k) => category.includes(k)) && amount !== null) {
      investTotal += amount
      investCount += 1
      if (lastInvestDate === null || date > lastInvestDate) lastInvestDate = date
    }
    if (!date.startsWith(month)) continue
    monthRows += 1
    const excluded = NON_SPEND.some((k) => category.includes(k))
    if (amount !== null) {
      if (excluded) monthInvest += amount
      else monthSpend += amount
    }
    if (EAT_OUT.some((k) => category.includes(k))) eatOut += 1
  }
  return {
    available: true,
    month,
    monthSpend: Math.round(monthSpend * 100) / 100,
    monthInvest: Math.round(monthInvest * 100) / 100,
    eatOutCount: eatOut,
    monthRows,
    latest,
    investTotal: Math.round(investTotal * 100) / 100,
    investCount,
    lastInvestDate,
    src: PATHS.financeFile,
  }
}

async function foldFinanceData(vaultRoot) {
  const file = path.join(vaultRoot, PATHS.financeFile)
  let mtimeMs
  try {
    mtimeMs = (await stat(file)).mtimeMs
  } catch {
    return { available: false }
  }
  if (financeCache && financeCache.mtimeMs === mtimeMs) return financeCache.value
  let value
  try {
    value = foldFinance(await readFile(file, 'utf8'))
  } catch {
    value = { available: false }
  }
  financeCache = { mtimeMs, value }
  return value
}

// ---------- 资产快照（life/private/资产快照.tsv） ----------

/**
 * 资产快照：一行一笔持仓，列＝日期 / 类别 / 名称 / 金额万。
 * 只做聚合（按类别分组 + 占比），不做净值换算；数据由用户按截图手工落表。
 * 敏感度与消费流水同级 ⇒ 同样走 include:['finance'] 才读。
 */
let assetsCache = null // { mtimeMs, value }

function foldAssets(markdown) {
  const lines = markdown.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return { available: false }
  const header = lines[0].split('\t').map((c) => c.trim())
  const idx = (name) => header.findIndex((h) => h.includes(name))
  const iDate = idx('日期')
  const iCat = idx('类别')
  const iName = idx('名称')
  const iAmt = idx('金额万')
  const rows = []
  let asOf = ''
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const date = (cells[iDate] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const amount = Number(String(cells[iAmt] ?? '').replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) continue
    rows.push({
      date,
      group: (cells[iCat] ?? '').trim() || '其他',
      name: (cells[iName] ?? '').trim(),
      amount,
    })
    if (date > asOf) asOf = date
  }
  if (rows.length === 0) return { available: false }
  // 只取最新那一天（快照语义：旧日期视为历史，不叠加）
  const latestRows = rows.filter((r) => r.date === asOf)
  const total = latestRows.reduce((sum, r) => sum + r.amount, 0)
  const round = (n) => Math.round(n * 100) / 100
  const groups = []
  for (const r of latestRows) {
    let g = groups.find((x) => x.group === r.group)
    if (!g) {
      g = { group: r.group, amount: 0, count: 0 }
      groups.push(g)
    }
    g.amount += r.amount
    g.count += 1
  }
  for (const g of groups) {
    g.amount = round(g.amount)
    g.pct = total > 0 ? Math.round((g.amount / total) * 100 * 100) / 100 : 0
  }
  groups.sort((a, b) => b.amount - a.amount)
  const holdings = latestRows
    .map((r) => ({ name: r.name, group: r.group, amount: round(r.amount), pct: total > 0 ? Math.round((r.amount / total) * 100 * 100) / 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return {
    available: true,
    asOf,
    total: round(total),
    unit: '万元',
    groups,
    holdings,
    top: holdings.slice(0, 5),
    src: PATHS.assetsFile,
  }
}

async function foldAssetsData(vaultRoot) {
  const file = path.join(vaultRoot, PATHS.assetsFile)
  let mtimeMs
  try {
    mtimeMs = (await stat(file)).mtimeMs
  } catch {
    return { available: false }
  }
  if (assetsCache && assetsCache.mtimeMs === mtimeMs) return assetsCache.value
  let value
  try {
    value = foldAssets(await readFile(file, 'utf8'))
  } catch {
    value = { available: false }
  }
  assetsCache = { mtimeMs, value }
  return value
}

// ---------- 书架（notes/书架/*.md） ----------

const shelfCache = new Map() // file -> { mtimeMs, book }
let shelfListingCache = null // { dirMtimeMs, files: string[] }
let coverListingCache = null // { dirMtimeMs, files: Set<string> }

function parseBook(markdown) {
  const titleMatch = /^#\s*《?([^》\n]+)》?/m.exec(markdown)
  const title = titleMatch ? titleMatch[1].trim() : ''
  const author = /作者\**：\**\s*([^·\n]+)/.exec(markdown)?.[1]?.trim() ?? null
  const category = /分类\**：\**\s*([^·\n]+)/.exec(markdown)?.[1]?.trim() ?? null
  const added = /入库\**：\**\s*(\d{4}-\d{2}-\d{2})/.exec(markdown)?.[1] ?? null
  const level = /级别\**：\**\s*(原文级|框架级)/.exec(markdown)?.[1] ?? null
  return { title, author, category, added, level }
}

// ---------- 格式体检（2026-11-10） ----------
/**
 * 读用户实际文件，指出「差在哪」而不是只说「数据缺席」。
 * 纯只读；任何异常都吞掉（体检失败不影响看板）。
 */
async function diagnose(vaultRoot) {
  const out = []
  const push = (card, code, message, expect, file) => out.push({ card, code, message, expect, file })

  // 1) 每日日志
  const logDirAbs = path.join(vaultRoot, PATHS.logDir)
  if (!(await pathExists(logDirAbs))) {
    push('health', 'log-missing', `没找到日志目录：${PATHS.logDir}`, '_assistant/life/log/2026-11-10.md', PATHS.logDir)
  } else {
    let latestFile = null
    const now = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const f = path.join(logDirAbs, `${dayKey(d)}.md`)
      if (await pathExists(f)) { latestFile = f; break }
    }
    if (latestFile === null) {
      push('health', 'log-empty', '日志目录是空的（近 14 天没有 YYYY-MM-DD.md）', '_assistant/life/log/2026-11-10.md', PATHS.logDir)
    } else {
      let md = ''
      try { md = await readFile(latestFile, 'utf8') } catch { /* 读不到就不诊断 */ }
      md = normalizeDigits(md)
      const secs = sectionsOf(md)
      const healthText = [...secs.entries()].find(([k]) => k.startsWith('健康'))?.[1] ?? ''
      if (!healthText) {
        push('health', 'log-no-section', '日志里没有「## 健康」段', '## 健康\n\n| 指标 | 数值 |', path.relative(vaultRoot, latestFile))
      } else if (tableCell(healthText, '体重').value === null) {
        const inline = /体重[^\n]{0,16}?(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i.test(md)
        push('health', inline ? 'log-inline' : 'log-label',
          inline ? '「体重」写成了正文/列表，没有放进「健康」段的表格里' : '「健康」段里没有「体重」这一行',
          '| 体重 | **69.5 kg** |\n| 体脂率 | **22.1%** |', path.relative(vaultRoot, latestFile))
      }
    }
  }

  // 2) 待办
  const todoAbs = path.join(vaultRoot, PATHS.todoFile)
  if (!(await pathExists(todoAbs))) {
    push('tasks', 'todo-missing', `没找到待办文件：${PATHS.todoFile}`, '- [ ] 整理季度复盘 | 截止：2026-11-20 | #工作', PATHS.todoFile)
  } else {
    let md = ''
    try { md = await readFile(todoAbs, 'utf8') } catch { /* skip */ }
    if (md && !/^\s*[-*]\s*\[[ xX]\]/m.test(md)) {  // m 标志：逐行找，别只看第一行（误报修于 2026-11-10）
      push('tasks', 'todo-nobox', '待办文件里没有复选框行（插件只认 `- [ ]` 开头的条目）', '- [ ] 整理季度复盘 | 截止：2026-11-20 | #工作', PATHS.todoFile)
    }
  }

  // 3) 资产快照（常见错：列名/分隔符不对）
  const assetsAbs = path.join(vaultRoot, PATHS.assetsFile)
  if (PATHS.assetsFile && (await pathExists(assetsAbs))) {
    let head = ''
    try { head = (await readFile(assetsAbs, 'utf8')).split(/\r?\n/).find((l) => l.trim() !== '') ?? '' } catch { /* skip */ }
    if (head && !(head.includes('\t') && head.includes('日期'))) {
      push('assets', 'assets-cols', '资产表的表头不像 TSV（需要制表符分隔、首行含「日期 类别 名称 金额万」）', '日期\t类别\t名称\t金额万', PATHS.assetsFile)
    }
  }

  // 4) 书架
  const shelfAbs = path.join(vaultRoot, PATHS.shelfDir)
  if (!(await pathExists(shelfAbs))) {
    push('shelf', 'shelf-missing', `没找到书架目录：${PATHS.shelfDir}`, '_assistant/notes/书架/<书名>.md', PATHS.shelfDir)
  }

  return out
}

async function foldShelf(vaultRoot) {
  const dir = path.join(vaultRoot, PATHS.shelfDir)
  let dirMtimeMs
  try {
    dirMtimeMs = (await stat(dir)).mtimeMs
  } catch {
    return { available: false, hint: { code: 'no-file', path: dir } }
  }
  let names
  if (shelfListingCache && shelfListingCache.dirMtimeMs === dirMtimeMs) {
    names = shelfListingCache.files
  } else {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      names = entries
        .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
        .map((e) => e.name)
        .sort()
      shelfListingCache = { dirMtimeMs, files: names }
    } catch {
      return { available: false }
    }
  }
  const books = []
  for (const name of names) {
    const file = path.join(dir, name)
    let mtimeMs
    try {
      mtimeMs = (await stat(file)).mtimeMs
    } catch { continue }
    const cached = shelfCache.get(file)
    if (cached && cached.mtimeMs === mtimeMs) {
      if (cached.book) books.push(cached.book)
      continue
    }
    let book = null
    try {
      book = parseBook(await readFile(file, 'utf8'))
    } catch { book = null }
    shelfCache.set(file, { mtimeMs, book })
    if (book) books.push(book)
  }
  // 只认真正写了「级别」的书；分类索引页（如 小说类.md）不计入
  const real = books.filter((b) => b.level !== null)
  const original = real.filter((b) => b.level === '原文级').length
  // 封面：life/private/书/封面/<书名>.<ext>（个人留存，不进 Gitee）
  let coverFiles = new Set()
  try {
    const coverDir = path.join(vaultRoot, PATHS.coverDir)
    const dirMtimeMs = (await stat(coverDir)).mtimeMs
    if (coverListingCache === null || coverListingCache.dirMtimeMs !== dirMtimeMs) {
      coverListingCache = {
        dirMtimeMs,
        files: new Set((await readdir(coverDir)).filter((n) => /\.(jpe?g|png|webp)$/i.test(n))),
      }
    }
    coverFiles = coverListingCache.files
  } catch { /* 没有封面目录就退回文字 */ }
  const dated = real.filter((b) => b.added).sort((a, b) => (a.added < b.added ? 1 : -1))
  return {
    available: real.length > 0,
    count: real.length,
    originalCount: original,
    latest: dated[0] ? { title: dated[0].title, added: dated[0].added, category: dated[0].category } : null,
    categories: [...new Set(real.map((b) => b.category).filter(Boolean))],
    src: PATHS.shelfDir + '/',
    books: [...dated, ...real.filter((b) => !b.added)].map((b) => ({
      title: b.title,
      author: b.author,
      category: b.category,
      added: b.added,
      level: b.level,
      cover: [...coverFiles].some((f) => f.replace(/\.[^.]+$/, '') === b.title),
    })),
  }
}

// ---------- 路由 ----------


// ---------- e-ink 只读页（Kindle KOReader 常显任务） ----------

/** Kindle 浏览器不认 emoji，渲染成 □；e-ink 页统一剥掉 */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu
function stripEmoji(str) {
  return String(str).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim()
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 全量解析未完成条目（foldTodo 只给看板前 12 条，e-ink 要全量） */
function parseAllOpen(markdown) {
  const items = []
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^- \[ \]/.test(line)) continue
    const body = line.replace(/^- \[ \]\s*/, '')
    const rawTitle = cleanTitle(body.split('|')[0])
    const title = stripEmoji(rawTitle)
    const date = pickDate(body)
    items.push({ title, date, group: classifyGroup(line), overdue: false })
  }
  const today = dayKey(new Date())
  for (const i of items) i.overdue = i.date !== null && i.date < today
  return items
}

/** 相对日期：看板同款口径（今天/明天/N 天后/逾期 N 天/未定） */
function dateRelLabel(dateStr) {
  if (dateStr === null) return '未定'
  const today = dayKey(new Date())
  const d0 = new Date(today + 'T00:00:00')
  const d1 = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d1 - d0) / 86400000)
  if (Number.isNaN(diff)) return dateStr
  if (diff < 0) return `逾期 ${-diff} 天`
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  return `${diff} 天后`
}

/** 同日期归并显示：今天 / 明天 / 具体日期 */
function dateLabel(dateStr) {
  if (dateStr === null) return '未定'
  const today = dayKey(new Date())
  if (dateStr === today) return '今天'
  if (dateStr === shiftDay(today, 1)) return '明天'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const y = Number(m[1]), now = Number(today.slice(0, 4))
  // 跨年要带年份，否则「1-30」会被读成今年
  return y === now ? `${Number(m[2])}-${Number(m[3])}` : `${String(y).slice(2)}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

/** 余额 + 今日 Token：余额走 DSH credentials 服务取 key（与 dsh-context 同源），Token 读会话投影缓存 */
let usageCache = { at: 0, text: '' }
async function readUsageLine(ctx) {
  const now = Date.now()
  if (now - usageCache.at < 10 * 60 * 1000) return usageCache.text
  const parts = []
  try {
    const creds = ctx.get('credentials')
    const resolved = typeof creds?.resolve === 'function' ? await creds.resolve('DEEPSEEK_API_KEY') : null
    const key = typeof resolved?.value === 'string' ? resolved.value : ''
    if (key !== '') {
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        const infos = Array.isArray(data?.balance_infos) ? data.balance_infos : []
        const cny = infos.find((i) => i?.currency === 'CNY') || infos[0]
        const total = Number(cny?.total_balance ?? cny?.granted_balance ?? 0)
        if (Number.isFinite(total)) parts.push(`余额 ¥${total.toFixed(2)}`)
      }
    }
  } catch { /* 网络/凭证缺失：静默跳过 */ }
  try {
    const dir = path.join(process.env.HOME || '', '.dsh', 'storages', 'session_projcache', 'sessions')
    const today = dayKey(new Date())
    let tokens = 0
    let active = 0
    const { readdir } = await import('node:fs/promises')
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(await readFile(path.join(dir, name), 'utf8'))
        const rows = raw?.record?.rows || {}
        const lp = ((rows.sessionListMetadata || {}).val || {}).lastPromptAt
        if (typeof lp !== 'number') continue
        if (dayKey(new Date(lp)) !== today) continue
        const totals = ((rows.tokenUsage || {}).val || {}).totals || {}
        const sum = (totals.uncachedInputTokens || 0) + (totals.outputTokens || 0) + (totals.cacheReadTokens || 0)
        if (sum > 0) { tokens += sum; active += 1 }
      } catch { /* 单个会话读失败：跳过 */ }
    }
    if (tokens > 0) parts.push(`今日 Token ${(tokens / 1e6).toFixed(1)}M${active > 1 ? ` · ${active} 会话` : ''}`)
  } catch { /* 目录缺失：静默跳过 */ }
  usageCache = { at: now, text: parts.join(' · ') }
  return usageCache.text
}

function renderHealthStrip(health) {
  if (!health || health.available !== true) return ''
  const v = health.vitals || {}
  const parts = []
  if (health.weightKg !== null && health.weightKg !== undefined) {
    const w = Number(health.weightKg)
    const wText = Number.isFinite(w) ? String(Math.round(w * 10) / 10) : String(health.weightKg)
    const delta = health.weightDelta
    let tail = ''
    if (delta !== null && delta !== undefined) {
      const d = Number(delta)
      if (Number.isFinite(d) && d !== 0) tail = ` ${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}`
    }
    parts.push(`体重 <b>${wText}</b>kg${tail}`)
  }
  if (v.bodyFat !== null && v.bodyFat !== undefined) parts.push(`体脂 <b>${v.bodyFat}</b>%`)
  if (v.visceralFat !== null && v.visceralFat !== undefined) parts.push(`内脏脂肪 <b>${v.visceralFat}</b>级`)
  const p = health.protein
  if (p && p.grams !== null && p.grams !== undefined) {
    const tgt = p.target ?? 130
    parts.push(`蛋白 <b>${p.grams}</b>/${tgt}g${p.partial ? '（截至当前）' : ''}`)
  }
  if (parts.length === 0) return ''
  return `<p class="health">${parts.join(' · ')}</p>`
}

function renderEinkPage(items, generatedAt, health, usage) {
  const undated = items.filter((i) => i.date === null).length
  const groups = { work: [], life: [] }
  for (const i of items) groups[i.group === 'work' ? 'work' : 'life'].push(i)
  for (const g of Object.values(groups)) g.sort((a, b) => {
    const ad = a.date ?? '9999', bd = b.date ?? '9999'
    return ad < bd ? -1 : ad > bd ? 1 : 0
  })
  const section = (label, list) => {
    if (list.length === 0) return ''
    const rows = list.map((i) => {
      const cls = i.overdue ? 'chip od' : 'chip'
      return `<tr><td class="${cls}">${escHtml(dateRelLabel(i.date))}</td><td class="t">${escHtml(i.title)}</td></tr>`
    }).join('')
    return `<h2>${label} <i>${list.length}</i></h2><table class="tasks">${rows}</table>`
  }
  const body = [
    section('工作', groups.work),
    section('生活', groups.life),
  ].join('') || '<p class="empty">今天没有未完成任务</p>'
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="120">
<title>任务看板</title>
<style>
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,"PingFang SC",sans-serif;font-size:21px;line-height:1.34;margin:0;padding:0 0 12px;color:#111;background:#fff}
table.topbar{width:100%;border-collapse:collapse;background:#f2f2f2;border-bottom:1px solid #ccc;margin:0 0 12px}
table.topbar td{padding:9px 14px;vertical-align:baseline}
table.topbar td.brand{font-size:26px;font-weight:700;letter-spacing:.5px;white-space:nowrap;padding-bottom:2px}
table.topbar td.usage{font-size:22px;color:#111;padding-top:0}
p.meta{font-size:13px;color:#666;margin:0 0 10px;padding:0 14px}
h2,h2+p,table.tasks,p.health,p.foot{margin-left:14px;margin-right:14px}
h2{font-size:19px;margin:16px 0 4px;border-bottom:2px solid #999;padding-bottom:4px}
h2 i{font-style:normal;font-weight:normal;color:#888;font-size:15px}
table.tasks{width:100%;border-collapse:collapse;table-layout:fixed}
table.tasks td{padding:7px 0;border-bottom:1px dashed #c8c8c8;vertical-align:baseline}
td.chip{width:5em;font-size:14px;line-height:1.34;color:#666;white-space:nowrap;text-align:right;padding-right:8px}
td.chip.od{color:#b00020;font-weight:600}
td.t{font-size:21px;line-height:1.34}
li span{flex:1}
p.foot{font-size:14px;color:#999;margin-top:18px}
p.health{font-size:17px;color:#333;margin:0 0 10px;padding:8px 10px;border:1px solid #bbb;border-radius:6px;background:#fafafa}
p.health b{font-weight:600}
p.empty{color:#888}
</style></head><body>
<table class="topbar"><tr><td class="brand">看板</td></tr>${usage ? `<tr><td class="usage">${escHtml(usage)}</td></tr>` : ''}</table>
<p class="meta">${items.length} 条${undated > 0 ? ` · ${undated} 条无日期` : ''} · 更新 ${generatedAt}</p>
${renderHealthStrip(health)}
${body}
<p class="foot">源：TODO.md · 只读 · 每 2 分钟刷新</p>
</body></html>`
}

function registerRoute(ctx, routePath, handler, label) {
  const conn = ctx.get('connection')
  const register = typeof conn?.fetch?.register === 'function' ? conn.fetch.register.bind(conn.fetch) : undefined
  if (register === undefined) return false
  try {
    ctx.effect(() => register({ path: routePath, methods: ['POST'], requestBody: 'buffered', fetch: handler }), label)
    return true
  } catch {
    return false
  }
}

export async function apply(ctx, config) {
  const configuredRoot = (config?.vaultRoot ?? '').trim()
  for (const key of Object.keys(DEFAULT_PATHS)) {
    const v = config?.[key]
    if (typeof v === 'string' && v.trim() !== '') PATHS[key] = v.trim()
  }
  const windowDays = Number.isFinite(config?.windowDays) ? config.windowDays : (config?.healthWindowDays ?? 7)
  // 用户设置（设置页保存的）优先级最高；读失败就沿用 row config / 默认值
  const mergedConfig = { ...(config ?? {}) }
  await (async () => {
    const saved = await readUserSettings()
    USER_SETTINGS = saved
    applySettings(saved)
    for (const key of SETTINGS_KEYS) if (saved[key] !== undefined) mergedConfig[key] = saved[key]
  })().catch(() => {})
  RUNTIME_CONFIG = mergedConfig
  if (mergedConfig.demoMode === true) {
    try {
      const { ensureDemoVault } = await import('./demo-data.mjs')
      await ensureDemoVault(path.join(process.env.HOME || '', '.dsh', 'storages', 'dsh-lifeboard', 'demo-vault'), RUNTIME_CONFIG.demoCoverDir || '')
    } catch (error) {
      ctx.logger?.warn('lifeboard: demo vault 生成失败 ' + String(error))
    }
  }
  if (Number.isFinite(config?.proteinTarget)) cfgProteinTarget = config.proteinTarget
  if (Number.isFinite(config?.proteinTolerance)) cfgProteinTolerance = config.proteinTolerance
  if (Number.isFinite(config?.fatGoalKg)) cfgFatGoalKg = config.fatGoalKg

  /**
   * 候选 vault 根目录（按可靠性排序）：
   *  1. 插件配置 vaultRoot
   *  2. 活动会话各自的工作目录（会话就跑在 vault 里）
   *  3. workspaceRegistry 里登记的 workspace 目录
   *  4. workingDirectory.defaultDirectory / process.cwd() 兜底
   * 校验标准：`_assistant/TODO.md` 在位。
   */
  function candidateRoots() {
    const roots = []
    // 演示模式：用插件自带示例数据（与真实目录完全隔离）
    if (RUNTIME_CONFIG?.demoMode === true) {
      roots.push(path.join(process.env.HOME || '', '.dsh', 'storages', 'dsh-lifeboard', 'demo-vault'))
    }
    // 设置页保存的 vaultRoot 优先（切演示数据时不必改 profile）
    const liveRoot = typeof RUNTIME_CONFIG?.vaultRoot === 'string' ? RUNTIME_CONFIG.vaultRoot.trim() : ''
    if (liveRoot !== '') roots.push(liveRoot)
    else if (configuredRoot !== '') roots.push(configuredRoot)

    const wd = ctx.get('workingDirectory')
    try {
      const agents = ctx.get('agents')
      for (const agent of agents?.list?.() ?? []) {
        try {
          const dir = wd?.get?.(agent.session)
          if (typeof dir === 'string' && dir !== '') roots.push(dir)
        } catch { /* skip */ }
        try {
          const cwd = agent?.session?.header?.cwd
          if (typeof cwd === 'string' && cwd !== '') roots.push(cwd)
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    try {
      const registry = ctx.get('workspaceRegistry')
      for (const ws of registry?.list?.() ?? []) {
        const dir = ws?.path ?? ws?.directory ?? ws?.root
        if (typeof dir === 'string' && dir !== '') roots.push(dir)
      }
    } catch { /* skip */ }

    try {
      if (typeof wd?.defaultDirectory === 'string') roots.push(wd.defaultDirectory)
    } catch { /* skip */ }
    try {
      if (typeof process?.cwd === 'function') roots.push(process.cwd())
    } catch { /* skip */ }

    return [...new Set(roots)]
  }

  let resolvedRoot = null
  let seenEpoch = CONFIG_EPOCH

  async function resolveVaultRoot() {
    if (seenEpoch !== CONFIG_EPOCH) { resolvedRoot = null; seenEpoch = CONFIG_EPOCH }
    // 命中过就记住（会话空闲时 agents 可能为空，不必重猜）
    if (resolvedRoot !== null) {
      try {
        await stat(path.join(resolvedRoot, PATHS.todoFile))
        return resolvedRoot
      } catch { resolvedRoot = null }
    }
    for (const root of candidateRoots()) {
      try {
        await stat(path.join(root, PATHS.todoFile))
        resolvedRoot = root
        return root
      } catch { /* try next */ }
    }
    return null
  }

  /**
   * 看板数据。财务默认不折叠（敏感）：客户端显式带 include:['finance'] 才读。
   */
  const boardHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: true, value: { vaultMissing: true } })
    let include = []
    try {
      const body = await req.json()
      if (Array.isArray(body?.include)) include = body.include.filter((v) => typeof v === 'string')
    } catch { /* 无 body 或非 JSON：按默认（不含敏感板块） */ }
    try {
      const wantFinance = include.includes('finance')
      const cardCfg = (typeof RUNTIME_CONFIG?.cards === 'object' && RUNTIME_CONFIG.cards) ? RUNTIME_CONFIG.cards : {}
      const cards = {
        health: cardCfg.health !== false,
        tasks: cardCfg.tasks !== false,
        assets: cardCfg.assets !== false,
        mood: cardCfg.mood !== false,
        shelf: cardCfg.shelf !== false,
      }
      const diagnostics = await diagnose(root).catch(() => [])
      const [health, tasks, shelf] = await Promise.all([
        foldHealth(root, windowDays),
        foldTasks(root),
        foldShelf(root),
      ])
      const [finance, assets] = wantFinance ? await Promise.all([foldFinanceData(root), foldAssetsData(root)]) : [null, null]
      return json({
        ok: true,
        value: {
          generatedAt: new Date().toISOString(),
          health,
          tasks,
          shelf,
          ...(wantFinance ? { finance: { ...(finance ?? {}), assets } } : {}),
          cards,
          demo: RUNTIME_CONFIG?.demoMode === true,
          diagnostics,
        },
      })
    } catch (error) {
      return json({ ok: false, error: { code: 'lifeboard/fold-failed', message: String(error) } }, 500)
    }
  }

  /**
   * 书封：POST /api/lifeboard/cover {book} → JSON {ok, value:{mime, base64}}。
   * 与 dsh-context attachment 同款：浏览器侧经带认证的 fetch() 取回，img 直接挂二进制
   * 会因缺认证 401，故回 JSON 由客户端转 data URL。（仅本机渲染，不出远端）
   */
  const coverMime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
  const coverHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: false, error: { code: 'lifeboard/vault-missing' } }, 404)
    let book = ''
    try {
      const body = await req.json()
      if (typeof body?.book === 'string') book = body.book
    } catch { /* 无 body */ }
    if (book === '' || /[/\\]/.test(book)) return json({ ok: false, error: { code: 'lifeboard/bad-request' } }, 400)
    try {
      const dir = path.join(root, PATHS.coverDir)
      const hit = (await readdir(dir)).find((f) => f.replace(/\.[^.]+$/, '') === book)
      if (!hit) return json({ ok: false, error: { code: 'lifeboard/not-found' } }, 404)
      const data = await readFile(path.join(dir, hit))
      const mime = coverMime[path.extname(hit).toLowerCase()] ?? 'image/jpeg'
      return json({ ok: true, value: { mime, base64: data.toString('base64') } })
    } catch {
      return json({ ok: false, error: { code: 'lifeboard/not-found' } }, 404)
    }
  }

  /**
   * 打开源文件：POST /api/lifeboard/open {path}（vault 内相对路径）→ macOS `open`。
   * 路径必须解析到 vault 内部且存在；不读取内容、不写出，只交给系统默认程序（.md → Obsidian）。
   */
  const openHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: false, error: { code: 'lifeboard/vault-missing' } }, 404)
    let rel = ''
    try {
      rel = String((await req.json())?.path ?? '')
    } catch { rel = '' }
    if (rel === '') return json({ ok: false, error: { code: 'lifeboard/bad-request' } }, 400)
    const rootAbs = path.resolve(root)
    const abs = path.resolve(rootAbs, rel)
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
      return json({ ok: false, error: { code: 'lifeboard/outside-vault' } }, 400)
    }
    // 安全边界（dsh.so 扫描 Warning 项）：只允许在 vault 内、且仅限文本类文件，
    // 用系统 `open` 交给默认程序；参数为数组形式，不经 shell，不存在命令注入。
    const ALLOWED_EXT = ['.md', '.markdown', '.tsv', '.json', '.txt', '.csv']
    if (!ALLOWED_EXT.includes(path.extname(abs).toLowerCase())) {
      return json({ ok: false, error: { code: 'lifeboard/unsupported-file' } }, 400)
    }
    try {
      const info = await stat(abs)
      if (!info.isFile()) return json({ ok: false, error: { code: 'lifeboard/not-a-file' } }, 400)
      if (info.size > 5 * 1024 * 1024) return json({ ok: false, error: { code: 'lifeboard/file-too-large' } }, 400)
    } catch {
      return json({ ok: false, error: { code: 'lifeboard/not-found' } }, 404)
    }
    try {
      const { spawn } = await import('node:child_process')
      const child = spawn('open', [abs], { detached: true, stdio: 'ignore' })
      child.unref()
      return json({ ok: true, value: { opened: rel } })
    } catch (error) {
      return json({ ok: false, error: { code: 'lifeboard/open-failed', message: String(error) } }, 500)
    }
  }

  /**
   * 任务操作（用户在面板手动点击触发，非模型推断）：
   *   POST /api/lifeboard/task {action:'done'|'postpone', line:<原始行>, days?}
   * 规则：写前备份 .backup/TODO.md.bak-lifeboard-<ts>（保留 5 份）；
   *       done = 勾掉 + 追加完成/反馈字段；postpone = 日期字段顺延 N 天（默认 1）。
   */
  const taskHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: false, error: { code: 'lifeboard/vault-missing' } }, 404)
    let action = ''
    let line = ''
    let days = 1
    try {
      const body = await req.json()
      action = String(body?.action ?? '')
      line = String(body?.line ?? '')
      if (Number.isFinite(body?.days)) days = Math.max(1, Math.min(30, Math.floor(body.days)))
    } catch { /* bad body */ }
    if ((action !== 'done' && action !== 'postpone') || line === '' || !line.startsWith('- [ ]')) {
      return json({ ok: false, error: { code: 'lifeboard/bad-request' } }, 400)
    }
    const file = path.join(root, PATHS.todoFile)
    let text = ''
    try {
      text = await readFile(file, 'utf8')
    } catch {
      return json({ ok: false, error: { code: 'lifeboard/not-found' } }, 404)
    }
    const lines = text.split(/\r?\n/)
    const idx = lines.findIndex((l) => l.trim() === line.trim())
    if (idx < 0) return json({ ok: false, error: { code: 'lifeboard/line-gone', message: '任务行已变化，请刷新后重试' } }, 409)

    if (action === 'done') {
      const today = dayKey(new Date())
      lines[idx] = lines[idx].replace(/^- \[ \]/, '- [x]') + ` | 完成：${today} | 反馈：看板手动勾选`
    } else {
      const m = /(截止|时间|计划)：(\d{4}-\d{2}-\d{2})/.exec(lines[idx])
      if (!m) return json({ ok: false, error: { code: 'lifeboard/no-date', message: '该行没有可延期的日期字段' } }, 400)
      const next = shiftDay(m[2], days)
      lines[idx] = lines[idx].slice(0, m.index) + `${m[1]}：${next}` + lines[idx].slice(m.index + m[0].length)
    }

    // 备份环：保留最近 5 份
    try {
      const bakDir = path.join(root, PATHS.backupDir)
      await import('node:fs/promises').then((fs) => fs.mkdir(bakDir, { recursive: true }))
      const { writeFile, readdir: rd } = await import('node:fs/promises')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await writeFile(path.join(bakDir, `TODO.md.bak-lifeboard-${stamp}`), text, 'utf8')
      const old = (await rd(bakDir)).filter((n) => n.startsWith('TODO.md.bak-lifeboard-')).sort()
      for (const name of old.slice(0, Math.max(0, old.length - 5))) {
        await import('node:fs/promises').then((fs) => fs.unlink(path.join(bakDir, name)).catch(() => {}))
      }
    } catch { /* 备份失败不阻断写入 */ }

    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(file, lines.join('\n'), 'utf8')
    } catch (error) {
      return json({ ok: false, error: { code: 'lifeboard/write-failed', message: String(error) } }, 500)
    }
    todoCache = null
    return json({ ok: true, value: foldTodo(lines.join('\n')) })
  }

  /**
   * 随机书摘：POST /api/lifeboard/excerpt {book} → {kind:'原文'|'书摘', source, text}
   * 原文 = 抽取目录随机一章的正文段落（跳过版权页/章节001，过滤短行与标题行）
   * 书摘 = 书架 md 的「核心框架/关键概念卡」条目。50/50，首选失败自动回退另一种。
   */
  const excerptHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: false, error: { code: 'lifeboard/vault-missing' } }, 404)
    let book = ''
    try { book = String((await req.json())?.book ?? '') } catch { book = '' }
    if (book === '' || /[/\\]/.test(book)) return json({ ok: false, error: { code: 'lifeboard/bad-request' } }, 400)

    const lcp = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n }
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

    async function fromOriginal() {
      const base = path.join(root, PATHS.excerptDir)
      const dirs = await readdir(base)
      const dir = dirs.map((d) => ({ d, n: lcp(d, book) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)[0]?.d
      if (!dir) throw new Error('no dir')
      const files = (await readdir(path.join(base, dir)))
        .filter((f) => /^章节(\d+)\.md$/.test(f) && Number(f.replace(/[^\d]/g, '')) >= 2)
      if (files.length === 0) throw new Error('no chapters')
      const file = rand(files)
      const text = await readFile(path.join(base, dir, file), 'utf8')
      const paras = text.split(/\n+/).map((t) => t.trim())
        .filter((t) => t.length >= 40 && !t.startsWith('#') && !t.includes('图书在版编目'))
      if (paras.length === 0) throw new Error('no paras')
      const i = Math.floor(Math.random() * paras.length)
      const snippet = paras.slice(i, i + 2).join('\n').slice(0, 240)
      return { kind: '原文', source: `${file.replace('.md', '')}`, text: snippet }
    }

    async function fromNotes() {
      const file = path.join(root, PATHS.shelfDir, `${book}.md`)
      const text = await readFile(file, 'utf8')
      const bullets = []
      let inSection = false
      for (const line of text.split(/\r?\n/)) {
        if (/^##\s/.test(line)) { inSection = /核心框架|关键概念卡/.test(line); continue }
        if (!inSection) continue
        const m = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line)
        if (m) bullets.push(m[1])
      }
      if (bullets.length === 0) throw new Error('no bullets')
      const clean = rand(bullets)
        .replace(/\*\*|__|`/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .trim()
      return { kind: '书摘', source: '书架·核心框架/概念卡', text: clean.slice(0, 200) }
    }

    try {
      const preferOriginal = Math.random() < 0.5
      const tries = preferOriginal ? [fromOriginal, fromNotes] : [fromNotes, fromOriginal]
      for (const fn of tries) {
        try { return json({ ok: true, value: { book, ...(await fn()) } }) } catch { /* try next */ }
      }
      return json({ ok: false, error: { code: 'lifeboard/no-excerpt' } }, 404)
    } catch (error) {
      return json({ ok: false, error: { code: 'lifeboard/excerpt-failed', message: String(error) } }, 500)
    }
  }

  /**
   * 情绪一键打卡（面板手动点击）：POST /api/lifeboard/mood {mood}
   * 往当日 log 的「## 情绪」段追加一条 `- **mood**（HH:MM 看板打卡）`；
   * 无当日文件/无情绪段时自动创建。写完失效该文件缓存。
   */
  const MOODS = ['饱满', '正常', '一般', '低迷']
  /**
   * 路径体检：POST /api/lifeboard/probe {values?}
   * 用户在设置页填完路径点「检查」，立刻知道每项找到没、能读到几条（2026-11-10 易用性）。
   */
  const probeHandler = async (req) => {
    let body = {}
    try { body = await req.json() } catch { /* 无 body 就按当前配置 */ }
    const vals = (body && typeof body.values === 'object' && body.values) || {}
    const pickPath = (key) => {
      const v = typeof vals[key] === 'string' ? vals[key].trim() : ''
      if (v !== '') return v
      const cfg = typeof RUNTIME_CONFIG?.[key] === 'string' ? RUNTIME_CONFIG[key].trim() : ''
      return cfg !== '' ? cfg : (DEFAULT_PATHS[key] ?? '')
    }
    const root = (typeof vals.vaultRoot === 'string' && vals.vaultRoot.trim() !== '')
      ? vals.vaultRoot.trim()
      : await resolveVaultRoot()
    if (root === null || root === '') return json({ ok: true, value: { vaultMissing: true, items: [] } })

    const items = []
    const rel = (p) => (p && p.startsWith(root) ? path.relative(root, p) : p)
    const statOf = async (abs) => { try { return await stat(abs) } catch { return null } }

    // 日志目录：目录在不在 + 近 14 天几份 + 最新日期
    {
      const abs = path.join(root, pickPath('logDir'))
      const st = await statOf(abs)
      if (st === null) items.push({ key: 'logDir', status: 'missing', path: rel(abs), detail: '目录不存在' })
      else if (!st.isDirectory()) items.push({ key: 'logDir', status: 'format', path: rel(abs), detail: '这是个文件，不是目录' })
      else {
        const now = new Date()
        let files = 0
        let latest = null
        for (let i = 0; i < 14; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
          const k = dayKey(d)
          if (await statOf(path.join(abs, `${k}.md`))) { files += 1; if (latest === null) latest = k }
        }
        items.push({ key: 'logDir', status: files > 0 ? 'ok' : 'empty', path: rel(abs), detail: files > 0 ? `近 14 天 ${files} 份，最新 ${latest}` : '近 14 天没有 YYYY-MM-DD.md' })
      }
    }

    // 待办：文件在不在 + 未完成条数
    {
      const abs = path.join(root, pickPath('todoFile'))
      const st = await statOf(abs)
      if (st === null) items.push({ key: 'todoFile', status: 'missing', path: rel(abs), detail: '文件不存在' })
      else {
        let md = ''
        try { md = await readFile(abs, 'utf8') } catch { /* skip */ }
        const open = (md.match(/^\s*[-*]\s*\[[ ]\]/gm) ?? []).length
        items.push({ key: 'todoFile', status: md.trim() === '' ? 'empty' : 'ok', path: rel(abs), detail: md.trim() === '' ? '文件是空的' : `未完成 ${open} 条` })
      }
    }

    // 资产 / 消费：TSV 表头
    for (const key of ['assetsFile', 'financeFile']) {
      const abs = path.join(root, pickPath(key))
      const st = await statOf(abs)
      if (st === null) { items.push({ key, status: 'missing', path: rel(abs), detail: '文件不存在（这张卡会隐藏，属正常）' }); continue }
      let head = ''
      try { head = (await readFile(abs, 'utf8')).split(/\r?\n/).find((l) => l.trim() !== '') ?? '' } catch { /* skip */ }
      const okHead = head.includes('\t')
      items.push({ key, status: okHead ? 'ok' : 'format', path: rel(abs), detail: okHead ? '制表符分隔，可读' : '不是 TSV（需要制表符分隔）' })
    }

    // 书架：目录 + .md 数量
    {
      const abs = path.join(root, pickPath('shelfDir'))
      const st = await statOf(abs)
      if (st === null) items.push({ key: 'shelfDir', status: 'missing', path: rel(abs), detail: '目录不存在' })
      else {
        let names = []
        try { names = (await readdir(abs)).filter((n) => n.endsWith('.md')) } catch { /* skip */ }
        items.push({ key: 'shelfDir', status: names.length > 0 ? 'ok' : 'empty', path: rel(abs), detail: names.length > 0 ? `${names.length} 本` : '目录里没有 .md' })
      }
    }

    return json({ ok: true, value: { root, items } })
  }

  const moodHandler = async (req) => {
    const root = await resolveVaultRoot()
    if (root === null) return json({ ok: false, error: { code: 'lifeboard/vault-missing' } }, 404)
    let mood = ''
    try { mood = String((await req.json())?.mood ?? '').trim() } catch { mood = '' }
    if (!MOODS.includes(mood)) return json({ ok: false, error: { code: 'lifeboard/bad-request' } }, 400)
    const today = dayKey(new Date())
    const file = path.join(root, PATHS.logDir, `${today}.md`)
    let text = ''
    try { text = await readFile(file, 'utf8') } catch { text = `# ${today}\n` }
    const now = new Date()
    const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const entry = `- **${mood}**（${stamp} 看板打卡）`
    const lines = text.split('\n')
    const idx = lines.findIndex((l) => /^##\s+情绪/.test(l))
    if (idx >= 0) {
      let j = idx + 1
      while (j < lines.length && !/^##\s/.test(lines[j])) j++
      lines.splice(j, 0, entry)
    } else {
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
      lines.push('', '## 情绪', '', entry)
    }
    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(file, lines.join('\n'), 'utf8')
    } catch (error) {
      return json({ ok: false, error: { code: 'lifeboard/write-failed', message: String(error) } }, 500)
    }
    logCache.delete(file)
    return json({ ok: true, value: { date: today, mood, entry } })
  }

  // e-ink 只读服务：局域网常显任务页（默认 8788，config.einkPort 覆盖；einkEnable=false 关闭）
  const einkEnabled = config?.einkEnable === true   // 默认关闭：上架版不主动监听端口
  const einkPort = Number.isFinite(config?.einkPort) ? config.einkPort : 8788
  const einkKindleDir = String(config?.einkKindleDir ?? '')   // 空 = 不快照；用户自己填挂载点
  if (einkEnabled) {
    ;(async () => {
    try {
      const { createServer } = await import('node:http')
      let einkCache = { mtimeMs: -1, html: '' }
      const buildEink = async () => {
        const root = await resolveVaultRoot()
        if (root === null) throw new Error('vault-missing')
        const file = path.join(root, PATHS.todoFile)
        const mtimeMs = (await stat(file)).mtimeMs
        if (einkCache.mtimeMs === mtimeMs) return einkCache.html
        const items = parseAllOpen(await readFile(file, 'utf8'))
        let health = null
        try { health = await foldHealth(root, windowDays) } catch { health = null }
        const now = new Date()
        let usage = ''
        try { usage = await readUsageLine(ctx) } catch { usage = '' }
        const html = renderEinkPage(items, `${pad(now.getHours())}:${pad(now.getMinutes())}`, health, usage)
        einkCache = { mtimeMs, html }
        // Kindle 离线快照：挂载时同步一份（内容变化才写）
        if (einkKindleDir !== '') {
          try {
            const { writeFile } = await import('node:fs/promises')
            await writeFile(path.join(einkKindleDir, 'lifeboard-tasks.html'), html, 'utf8')
          } catch { /* Kindle 未挂载时静默跳过 */ }
        }
        return html
      }
      const server = createServer(async (req, res) => {
        try {
        const reqUrl = String(req.url || '/')
        const pathOnly = reqUrl.split('?')[0]
        if (pathOnly !== '/' && pathOnly !== '/index.html') { res.writeHead(404); res.end('not found'); return }
        // 外网口令：~/.dsh/eink-token 存在时，必须带 ?k=<token>
        let need = ''
        try {
          need = (await readFile(path.join(process.env.HOME || '', '.dsh', 'eink-token'), 'utf8')).trim()
        } catch { need = '' }
        if (need !== '') {
          const given = new URL(reqUrl, 'http://localhost').searchParams.get('k') || ''
          if (given !== need) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); res.end('forbidden'); return }
        }
        buildEink().then((html) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          res.end(html)
        }).catch((error) => {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('lifeboard e-ink error: ' + String(error))
        })
        } catch (error) {
          try { res.writeHead(500); res.end('eink error') } catch {}
        }
      })
      server.on('error', (error) => ctx.logger?.warn('lifeboard: e-ink server error ' + String(error)))
      server.listen(einkPort, '0.0.0.0')
      ctx.logger?.info(`lifeboard: e-ink tasks page on 0.0.0.0:${einkPort}`)
      ctx.effect(() => () => server.close(), 'lifeboard: e-ink server')
    } catch (error) {
      // 11-03 教训：apply 必须防崩——e-ink 挂了不许拖死 GUI
      ctx.logger?.warn('lifeboard: e-ink server failed to start: ' + String(error))
    }
    })().catch((error) => ctx.logger?.warn('lifeboard: e-ink boot crash: ' + String(error)))
  }


  /** 把「默认 → row config → 用户保存」三层的值合成一份可编辑视图 */
  const viewSettings = () => {
    const cfg = RUNTIME_CONFIG ?? {}
    const pick = (key, fallback) => {
      const v = USER_SETTINGS?.[key] ?? cfg[key] ?? fallback
      return v
    }
    return {
      vaultRoot: pick('vaultRoot', ''),
      logDir: pick('logDir', DEFAULT_PATHS.logDir),
      todoFile: pick('todoFile', DEFAULT_PATHS.todoFile),
      assetsFile: pick('assetsFile', DEFAULT_PATHS.assetsFile),
      financeFile: pick('financeFile', DEFAULT_PATHS.financeFile),
      shelfDir: pick('shelfDir', DEFAULT_PATHS.shelfDir),
      coverDir: pick('coverDir', DEFAULT_PATHS.coverDir),
      excerptDir: pick('excerptDir', DEFAULT_PATHS.excerptDir),
      backupDir: pick('backupDir', DEFAULT_PATHS.backupDir),
      windowDays: pick('windowDays', 7),
      proteinTarget: pick('proteinTarget', 130),
      cards: Object.assign({ health: true, tasks: true, assets: true, mood: true, shelf: true }, cfg.cards ?? {}, USER_SETTINGS?.cards ?? {}),
      demoMode: pick('demoMode', false) === true,
      demoCoverDir: pick('demoCoverDir', ''),
      einkEnable: pick('einkEnable', false) === true,
      einkPort: pick('einkPort', 8788),
      einkKindleDir: pick('einkKindleDir', ''),
    }
  }

  /**
   * 设置接口：POST /api/lifeboard/settings
   *   {action:'get'}  → 当前生效值（默认值 + config + 用户保存的合并结果）
   *   {action:'save', values:{...}} → 写入 storages/dsh-lifeboard/settings.json 并即时生效
   */
  const settingsHandler = async (req) => {
    let body = {}
    try { body = await req.json() } catch { body = {} }
    const action = body?.action === 'save' ? 'save' : 'get'
    if (action === 'save') {
      try {
        ctx.logger?.info('lifeboard: settings save requested, keys=' + Object.keys(body?.values ?? {}).join(','))
        const saved = await writeUserSettings(body?.values ?? {})
        ctx.logger?.info('lifeboard: settings saved to ' + settingsFile())
        return json({ ok: true, value: { ...viewSettings(), ...saved } })
      } catch (error) {
        ctx.logger?.warn('lifeboard: settings save failed: ' + String(error))
        return json({ ok: false, error: { code: 'lifeboard/settings-write-failed', message: String(error) } }, 500)
      }
    }
    return json({ ok: true, value: viewSettings() })
  }

  const okSettings = registerRoute(ctx, '/api/lifeboard/settings', settingsHandler, 'lifeboard: settings route')
  if (!okSettings) ctx.logger?.warn('lifeboard: settings route unavailable')

  const okBoard = registerRoute(ctx, '/api/lifeboard/board', boardHandler, 'lifeboard: board route')
  const okCover = registerRoute(ctx, '/api/lifeboard/cover', coverHandler, 'lifeboard: cover route')
  const okOpen = registerRoute(ctx, '/api/lifeboard/open', openHandler, 'lifeboard: open route')
  const okTask = registerRoute(ctx, '/api/lifeboard/task', taskHandler, 'lifeboard: task route')
  const okExcerpt = registerRoute(ctx, '/api/lifeboard/excerpt', excerptHandler, 'lifeboard: excerpt route')
  const okMood = registerRoute(ctx, '/api/lifeboard/mood', moodHandler, 'lifeboard: mood route')
  const okProbe = registerRoute(ctx, '/api/lifeboard/probe', probeHandler, 'lifeboard: probe route')
  if (!okProbe) ctx.logger?.warn('lifeboard: probe route unavailable')
  if (!okBoard) ctx.logger?.warn('lifeboard: connection fetch route unavailable, board endpoint not registered')
  if (!okCover) ctx.logger?.warn('lifeboard: connection fetch route unavailable, cover endpoint not registered')
  if (!okOpen) ctx.logger?.warn('lifeboard: connection fetch route unavailable, open endpoint not registered')
  if (!okTask) ctx.logger?.warn('lifeboard: connection fetch route unavailable, task endpoint not registered')
  if (!okExcerpt) ctx.logger?.warn('lifeboard: connection fetch route unavailable, excerpt endpoint not registered')
  if (!okMood) ctx.logger?.warn('lifeboard: connection fetch route unavailable, mood endpoint not registered')
}
