/**
 * 三套示例 vault 回归：同一个插件，三种写法都要读得出来（M5）
 * 用法：node test/examples.mjs
 */
import path from 'node:path'
import * as plugin from '../index.js'

const cases = [
  { dir: 'zh-diary', label: '中文日记流' },
  { dir: 'obsidian', label: 'Obsidian 模板流' },
  { dir: 'en-journal', label: '英文 journal' },
]

const results = []
const check = (n, ok, extra = '') => { results.push([n, ok]); console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`) }

for (const c of cases) {
  const vault = path.join(new URL('../examples/', import.meta.url).pathname, c.dir)
  const routes = {}
  const ctx = {
    effect(fn) { fn() },
    get(n) { if (n === 'connection') return { fetch: { register({ path: p, fetch }) { routes[p] = fetch } } }; return undefined },
    logger: { info() {}, warn() {}, error() {} },
  }
  await plugin.apply(ctx, { vaultRoot: decodeURIComponent(vault), einkEnable: false })
  const call = async (p, body) => {
    const req = new Request('http://x' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    return (await (await routes[p](req)).json()).value ?? {}
  }
  const v = await call('/api/lifeboard/board', { include: ['finance'] })
  check(`${c.label} · 健康卡有数据`, v.health?.available === true, JSON.stringify(v.health?.hint ?? null))
  check(`${c.label} · 体重 69.8`, v.health?.weightKg === 69.8, String(v.health?.weightKg))
  check(`${c.label} · 任务卡有未完成`, (v.tasks?.openCount ?? 0) >= 2, String(v.tasks?.openCount))
  check(`${c.label} · 书架有书`, (v.shelf?.count ?? 0) >= 1, String(v.shelf?.count))
  check(`${c.label} · 情绪有记录`, (v.health?.mood?.loggedDays ?? 0) >= 2, String(v.health?.mood?.loggedDays))
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
