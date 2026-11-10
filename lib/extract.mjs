/**
 * 规则抽取器（M3 第一步，2026-11-10）
 *
 * 目标：从任意笔记里把「能进看板的事实」捞出来，**每条都带来源（文件:行）**。
 * 只做规则，不调模型；抽不准的宁可漏，不许编。
 *
 * 输出条目长这样：
 *   { kind, field, value, unit, line, raw, confidence, reason }
 *   kind: health | task | mood | goal
 *   confidence: high（行首有结构：表格/键值/列表）| low（正文里的句子，需人工确认）
 */

const NUM = '(-?\\d+(?:\\.\\d+)?)'

/** 健康指标：别名 → 标准字段（与 lib/parse.mjs 对齐，但这里带行号） */
const HEALTH_FIELDS = {
  weight: ['体重', '重量', 'body weight', 'weight'],
  bodyFat: ['体脂率', '体脂', 'body fat'],
  visceralFat: ['内脏脂肪等级', '内脏脂肪'],
  boneSalt: ['骨盐率', '骨盐'],
  heartRate: ['静息心率', '心率', 'heart rate'],
  sleep: ['睡眠时长', '睡了', '睡眠', 'sleep'],
}

const UNITS = {
  weight: { kg: 1, '公斤': 1, '千克': 1, '斤': 0.5, lb: 0.4536 },
  sleep: { '小时': 1, h: 1, '分钟': 1 / 60, min: 1 / 60 },
  bodyFat: { '%': 1 },
  visceralFat: { '级': 1 },
  boneSalt: { '%': 1 },
  heartRate: { bpm: 1, '次/分': 1 },
  protein: { g: 1, '克': 1 },
}

const round = (n) => Math.round(n * 1000) / 1000
const toStandard = (field, v, unit) => {
  const rules = UNITS[field] ?? {}
  const f = rules[String(unit ?? '').trim().toLowerCase()] ?? 1
  return round(Number(v) * f)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 从一段文本抽取条目。
 * @param {string} text 文件全文
 * @param {{ file?: string }} opts
 */
export function extractFromText(text, opts = {}) {
  const file = opts.file ?? ''
  const lines = String(text ?? '').split(/\r?\n/)
  const items = []
  const add = (item) => items.push({ file, ...item })

  let section = ''
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1
    const line = rawLine.trim()
    if (line === '') return
    const head = /^#{1,4}\s+(.+?)\s*$/.exec(line)
    if (head) { section = head[1]; return }

    // ---------- 健康：结构化行（表格 / 键值 / 列表）----------
    for (const [field, aliases] of Object.entries(HEALTH_FIELDS)) {
      for (const alias of aliases) {
        const a = escapeRe(alias)
        // 表格行：| 体重 | 69.5 kg |
        const table = new RegExp(`^\\|\\s*\\**${a}\\**\\s*\\|\\s*\\**\\s*${NUM}\\s*(kg|公斤|千克|斤|lb|%|级|bpm|次/分|小时|h|分钟|min|g|克)?`, 'i').exec(line)
        // 键值 / 列表：体重：69.5kg / - 体重 69.5 kg / - 体重:: 69.5
        const kv = new RegExp(`^(?:[-*+]\\s*)?\\**${a}\\**[^\\d\\n]{0,8}[:：=]{1,2}\\s*\\**\\s*${NUM}\\s*\\**\\s*(kg|公斤|千克|斤|lb|%|级|bpm|次/分|小时|h|分钟|min|g|克)?`, 'i').exec(line)
        const li = new RegExp(`^[-*+]\\s*\\**${a}\\**[^\\d\\n]{0,6}${NUM}\\s*(kg|公斤|千克|斤|lb|%|级|bpm|次/分|小时|h|分钟|min|g|克)?`, 'i').exec(line)
        const hit = table ?? kv ?? li
        if (hit) {
          add({
            kind: 'health', field, value: toStandard(field, hit[1], hit[2]), unit: hit[2] ?? '',
            line: lineNo, raw: line, confidence: 'high', reason: `识别到「${alias}」`,
          })
          return
        }
      }
    }

    // ---------- 蛋白：只看「蛋白」后面那个数 ----------
    const proteinLine = /蛋白[^\d\n]{0,4}(\d+(?:\.\d+)?)\s*g/i.exec(line)
    if (proteinLine) {
      // 分清「日终累计 / 每餐合计 / 分项估算」：看板只该用日终那个数
      const scope = /今日累计|全天/.test(line) ? 'dayTotal' : /合计/.test(line) ? 'mealTotal' : 'detail'
      add({
        kind: 'health', field: 'protein', value: Number(proteinLine[1]), unit: 'g', scope,
        line: lineNo, raw: line, confidence: 'high',
        reason: scope === 'dayTotal' ? '蛋白日终累计' : scope === 'mealTotal' ? '每餐合计' : '分项估算',
      })
      return
    }

    // ---------- 运动：跑步/骑行/步行 X km ----------
    const sport = /^(?:[-*+]\s*)?\**(\S*?(?:跑步|慢跑|步行|骑行|游泳|徒步|羽毛球|健身|力量训练))\**[^\d\n]{0,6}(\d+(?:\.\d+)?)\s*(km|公里|米|m|分钟|小时)?/i.exec(line)
    if (sport) {
      const unit = sport[3] ?? ''
      const distance = /km|公里/i.test(unit) ? Number(sport[2]) : /^m$|米/.test(unit) ? Number(sport[2]) / 1000 : null
      add({
        kind: 'health', field: 'exercise',
        value: distance !== null ? round(distance) : Number(sport[2]),
        unit: distance !== null ? 'km' : unit,
        line: lineNo, raw: line, confidence: 'high', reason: `运动：${sport[1]}`,
      })
      return
    }

    // ---------- 情绪 ----------
    const moodKv = /^(?:[-*+]\s*)?情绪\s*[:：]\s*\**([^\s*·|]{1,6})/.exec(line)
      ?? (/情绪|mood/i.test(section) ? /^[-*+]\s*\**([^\s*·|（(]{1,8})\**/.exec(line) : null)
    if (moodKv) {
      add({ kind: 'mood', field: 'mood', value: moodKv[1], line: lineNo, raw: line, confidence: 'high', reason: '情绪段' })
      return
    }

    // ---------- 待办：- [ ] xxxx ----------
    const task = /^[-*+]\s*\[( |x|X)\]\s*(.+)$/.exec(line)
    if (task) {
      add({
        kind: 'task', field: 'task', value: task[2].trim(), line: lineNo, raw: line,
        confidence: 'high', reason: task[1].trim() === '' ? '未完成待办' : '已完成待办',
        done: task[1].trim() !== '',
      })
      return
    }

    // ---------- 目标：目标体重 65kg ----------
    const goal = /目标[^\d\n]{0,6}(\d+(?:\.\d+)?)\s*(kg|公斤|斤)/i.exec(line)
    if (goal) {
      add({ kind: 'goal', field: 'weightGoal', value: toStandard('weight', goal[1], goal[2]), unit: 'kg', line: lineNo, raw: line, confidence: 'high', reason: '体重目标' })
      return
    }

    // ---------- 正文兜底（低可信度）：今天体重 69.5 公斤 ----------
    const inline = /(?:今天|今早|早上|称了)[^\d\n]{0,8}(\d+(?:\.\d+)?)\s*(kg|公斤|斤)/i.exec(line)
    if (inline) {
      add({ kind: 'health', field: 'weight', value: toStandard('weight', inline[1], inline[2]), unit: 'kg', line: lineNo, raw: line, confidence: 'low', reason: '正文句子' })
    }
  })

  return items
}

/** 汇总：给 UI 用的统计 */
export function summarize(items) {
  const byKind = {}
  for (const it of items) byKind[it.kind] = (byKind[it.kind] ?? 0) + 1
  const low = items.filter((i) => i.confidence === 'low').length
  return { total: items.length, byKind, low, high: items.length - low }
}
