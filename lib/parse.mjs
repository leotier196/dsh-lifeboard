/**
 * 兼容层：字段别名 + 单位换算 + 多格式嗅探（2026-11-10 M2 起步）
 *
 * 设计取舍：
 * - 只做事后解析，不要求用户改笔记结构
 * - 每条结果都带 confidence：high（行首有结构符号：表格 / `键：值` / `- 键 值`）与 low（正文里飘着的一句话）
 * - low 默认不直接上卡，交给调用方决定（foldDay 先用 high，兜底才用 low）
 */

const NUM = '(-?\\d+(?:\\.\\d+)?)'

/** 标准字段 → 别名（顺序即优先级，越靠前越可信） */
export const ALIASES = {
  weight: ['体重', '重量', 'body weight', 'weight'],
  bodyFat: ['体脂率', '体脂百分比', '体脂', 'body fat', 'fat%', 'fat'],
  visceralFat: ['内脏脂肪等级', '内脏脂肪', 'visceral fat', 'visceral'],
  boneSalt: ['骨盐率', '骨盐量', '骨盐', 'bone'],
  bmi: ['bmi'],
  heartRate: ['静息心率', '心率', 'heart rate', 'pulse', 'hr'],
  sleep: ['睡眠时长', '睡眠时间', '睡眠', '睡了', 'sleep'],
  exercise: ['运动', '锻炼', '跑步', '慢跑', '步行', '骑行', '游泳', '徒步', 'exercise', 'run'],
}

/** 单位归一：同一字段下不同单位换算到标准单位 */
const UNIT_RULES = {
  weight: { kg: 1, '公斤': 1, '千克': 1, '斤': 0.5, lb: 0.4536, '磅': 0.4536 },
  bodyFat: { '%': 1 },
  visceralFat: { '级': 1, level: 1 },
  boneSalt: { '%': 1 },
  bmi: {},
  heartRate: { bpm: 1, '次/分': 1 },
  sleep: { '小时': 1, h: 1, hr: 1, hours: 1, '分钟': 1 / 60, min: 1 / 60, mins: 1 / 60 },
  exercise: { km: 1, '公里': 1, '千米': 1, m: 1 / 1000, '米': 1 / 1000 },
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 从一段文字里取第一个数字，并按单位换算 */
export function toStandard(field, raw, unit) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const rules = UNIT_RULES[field] ?? {}
  const key = String(unit ?? '').trim().toLowerCase()
  const factor = rules[key]
  if (factor !== undefined) return round(value * factor)
  // 没带单位：体重默认 kg、睡眠默认小时、运动默认 km，其余原样
  if (key === '') return round(value)
  return round(value)
}

const round = (n) => Math.round(n * 1000) / 1000

/** 常见单位串（正则用） */
const UNIT_PATTERN = '(kg|公斤|千克|斤|lb|磅|%|级|level|bpm|次/分|小时|h|hr|hours|分钟|min|mins|km|公里|千米|米|m)?'

/**
 * 在健康段里找某个字段。按格式分三档可信度：
 *  high  — 表格行 `| 体重 | 69.5 kg |` / 键值 `体重：69.5kg` / 列表 `- 体重 69.5 kg`
 *  low   — 正文句子 `今天体重 69.5 kg`
 */
export function findMetric(sectionText, field) {
  const aliases = ALIASES[field] ?? []
  const lines = String(sectionText ?? '').split(/\r?\n/)
  let low = null

  for (const alias of aliases) {
    const a = escapeRe(alias)

    // 0) 表头式表格：| 体重(kg) | 体脂率(%) |  → 下一行才是值（Excel/Notion 导出常见）
    const tableRows = lines
      .filter((l) => l.trimStart().startsWith('|'))
      .map((l) => l.split('|').map((c) => c.trim()).filter((c) => c !== ''))
    if (tableRows.length >= 2) {
      const head = tableRows[0]
      const col = head.findIndex((c) => c.replace(/\*/g, '').toLowerCase().includes(alias.toLowerCase()))
      if (col >= 0 && !/\d/.test(head[col])) {
        for (const row of tableRows.slice(1)) {
          if (row.every((c) => /^:?-+:?$/.test(c))) continue
          const cell = (row[col] ?? '').replace(/\*/g, '')
          const m = new RegExp(`${NUM}\\s*${UNIT_PATTERN}`, 'i').exec(cell)
          if (m) {
            const value = toStandard(field, m[1], m[2])
            if (value !== null) return { value, unit: m[2] ?? '', confidence: 'high', raw: row.join(' | ') }
          }
          break // 只看第一条数据行
        }
      }
    }

    // 1) markdown 表格：| 体重 | 69.5 kg | 备注 |
    for (const line of lines) {
      if (!line.trimStart().startsWith('|')) continue
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '' && !/^:?-+:?$/.test(c))
      if (cells.length < 2) continue
      if (!cells[0].replace(/\*/g, '').toLowerCase().includes(alias.toLowerCase())) continue
      const m = new RegExp(`${NUM}\\s*${UNIT_PATTERN}`, 'i').exec(cells[1].replace(/\*/g, ''))
      if (m) {
        const value = toStandard(field, m[1], m[2])
        if (value !== null) return { value, unit: m[2] ?? '', confidence: 'high', raw: line.trim() }
      }
    }

    // 2) 键值行：体重：69.5kg / 体重: 69.5 / **体重**：69.5
    const kv = new RegExp(
      `^\\s*(?:[-*+]\\s*)?\\**${a}\\**\\s*(?:（[^）]*）)?\\s*[:：=]\\s*\\**\\s*${NUM}\\s*${UNIT_PATTERN}`,
      'im',
    ).exec(sectionText ?? '')
    if (kv) {
      const value = toStandard(field, kv[1], kv[2])
      if (value !== null) return { value, unit: kv[2] ?? '', confidence: 'high', raw: kv[0].trim() }
    }

    // 3) 列表式：- 体重 69.5 kg / - 睡了 7.5 小时
    const li = new RegExp(
      `^\\s*[-*+]\\s*\\**${a}\\**[^\\d\\n]{0,6}${NUM}\\s*${UNIT_PATTERN}`,
      'im',
    ).exec(sectionText ?? '')
    if (li) {
      const value = toStandard(field, li[1], li[2])
      if (value !== null) return { value, unit: li[2] ?? '', confidence: 'high', raw: li[0].trim() }
    }

    // 4) 正文兜底（最低可信度，只记候选）
    if (low === null) {
      const free = new RegExp(`${a}[^\\d\\n]{0,10}${NUM}\\s*${UNIT_PATTERN}`, 'i').exec(sectionText ?? '')
      if (free) {
        const value = toStandard(field, free[1], free[2])
        if (value !== null) low = { value, unit: free[2] ?? '', confidence: 'low', raw: free[0].trim() }
      }
    }
  }
  return low
}

/** 解析整段健康信息（别名 + 多格式），返回标准字段表 */
export function parseHealth(healthText, { allowLow = false } = {}) {
  const out = {}
  for (const field of Object.keys(ALIASES)) {
    const hit = findMetric(healthText, field)
    if (hit && (hit.confidence === 'high' || allowLow)) out[field] = hit.value
  }
  return out
}
