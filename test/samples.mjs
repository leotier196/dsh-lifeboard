/**
 * 异构样本回归（M2 验收）：10 份不同写法的日志 → 能否认出同一批指标
 * 用法：node test/samples.mjs
 *
 * 验收线（路线图 M2）：识别率 ≥85%，误读 0（读错值比读不到更严重）
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { parseHealth, findMetric } from '../lib/parse.mjs'

const dir = new URL('./samples/', import.meta.url).pathname
const files = (await readdir(decodeURIComponent(dir))).filter((n) => n.endsWith('.md')).sort()

/** 取「健康」段（或 Health / frontmatter） */
function healthSection(md) {
  const secs = new Map()
  let cur = ''
  for (const line of md.split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.+?)\s*$/.exec(line)
    if (h) { cur = h[1]; if (!secs.has(cur)) secs.set(cur, ''); continue }
    if (cur) secs.set(cur, secs.get(cur) + line + '\n')
  }
  const hit = [...secs.entries()].find(([k]) => /健康|health/i.test(k))
  if (hit) return hit[1]
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  return fm ? fm[1] : ''
}

const rows = []
for (const name of files) {
  const md = await readFile(path.join(decodeURIComponent(dir), name), 'utf8')
  const sec = healthSection(md)
  const m = parseHealth(sec, { allowLow: true })
  const sleepHit = findMetric(sec, 'sleep')
  rows.push({ name, weight: m.weight, heartRate: m.heartRate, sleep: sleepHit?.value ?? m.sleep })
}

let found = 0
console.log('样本                          体重    心率   睡眠')
for (const r of rows) {
  const ok = r.weight !== undefined
  if (ok) found += 1
  console.log(`${ok ? '✅' : '❌'} ${r.name.padEnd(26)} ${String(r.weight ?? '—').padStart(6)} ${String(r.heartRate ?? '—').padStart(5)} ${String(r.sleep ?? '—').padStart(5)}`)
}

const rate = found / rows.length
const expected = { '01-table.md': 69.5, '02-bullets.md': 69.5, '03-english.md': 69.5, '05-spoken-cn.md': 69.5, '06-table-generic.md': 69.5, '07-table-unit-in-label.md': 69.5, '08-frontmatter.md': 69.5, '09-obsidian.md': 69.5, '10-oneline.md': 69.5 }
let wrong = 0
for (const [name, want] of Object.entries(expected)) {
  const got = rows.find((r) => r.name === name)?.weight
  if (got !== undefined && got !== want) { wrong += 1; console.log(`⚠️ 误读 ${name}: ${got}（应为 ${want}）`) }
}
// 04 是磅：应为 ~69.35
const lb = rows.find((r) => r.name === '04-english-lb.md')?.weight
if (lb !== undefined && Math.abs(lb - 69.35) > 0.2) { wrong += 1; console.log(`⚠️ 误读 04-english-lb.md: ${lb}`) }

console.log(`\n识别率 ${(rate * 100).toFixed(0)}%（${found}/${rows.length}）· 误读 ${wrong} 条`)
const pass = rate >= 0.85 && wrong === 0
console.log(pass ? '✅ 达到 M2 验收线（≥85% 且无误读）' : '❌ 未达验收线')
process.exit(pass ? 0 : 1)
