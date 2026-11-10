/**
 * 自检（不依赖 DSH 运行时）：假 ctx + 假 vault，把三条路由真跑一遍。
 * 用法：node test/smoke.mjs
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as plugin from '../index.js'

const results = []
const check = (name, ok, extra = '') => {
  results.push([name, ok, extra])
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'lifeboard-test-'))
// 设置文件路径由 HOME 决定 —— 测试必须隔离，绝不能写进真实 ~/.dsh
process.env.HOME = tmp
const vault = path.join(tmp, 'vault')
const routes = {}
// fixture 日期必须跟"今天"走：写死会在第二天起让 today 断言全挂（2026-11-10 修）
const now = new Date()
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

async function seed() {
  await mkdir(path.join(vault, '_assistant', 'life', 'log'), { recursive: true })
  await mkdir(path.join(vault, '_assistant', 'notes', '书架'), { recursive: true })
  await mkdir(path.join(vault, '_assistant', 'life', 'private'), { recursive: true })
  await writeFile(path.join(vault, '_assistant', 'life', 'log', `${todayKey}.md`), `# ${todayKey}

## 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **70.0 kg** |
| 体脂率 | **22.0%** |
| 内脏脂肪 | **9 级** |
| 骨盐率 | **4.0%** |
| 心率 | **70** |

## 睡眠

- 睡了 7.5 小时

## 情绪

- **正常**

## 运动

- **户外步行 2.0 km**

## 饮食

- **早餐（08:00）**：蛋 2 个
  - 估算：蛋 2 个 ≈140 kcal / 蛋白 12g
  - **早餐合计：蛋白 ~26g · 热量 ~330 kcal**
- **今日累计（日终）**：蛋白 **~26g** · 热量 **~330 kcal**
`)
  await writeFile(path.join(vault, '_assistant', 'TODO.md'), `# 待办

- [ ] 🧪 测试条目 | 截止：2026-01-05 | #工作
- [x] 已完成条目
`)
  await writeFile(path.join(vault, '_assistant', 'life', 'private', '资产快照.tsv'), `日期\t类别\t名称\t金额万
2026-11-09\t基金\t某基金\t30
2026-11-09\t现金\t余额宝\t10
`)
  await writeFile(path.join(vault, '_assistant', 'life', 'private', '消费流水.tsv'), `日期\t类别\t金额元\t渠道\t备注
2026-11-09\t外食\t50\t到店\t午餐
`)
  await writeFile(path.join(vault, '_assistant', 'notes', '书架', '测试书.md'), '# 测试书\n\n> 作者：某人 · 分类：测试类 · 级别：原文级 · 加入：2026-01-01\n\n## 核心框架\n- 这是摘句\n')
}

const ctx = {
  effect(fn) { fn() },
  get(name) {
    if (name === 'connection') {
      return { fetch: { register({ path: p, fetch }) { routes[p] = fetch } } }
    }
    return undefined
  },
  logger: { info() {}, warn() {}, error() {} },
}

await seed()
await plugin.apply(ctx, { vaultRoot: vault, einkEnable: false })

const call = async (p, body) => {
  const fn = routes[p]
  if (!fn) throw new Error('route missing: ' + p)
  const req = new Request('http://localhost' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const res = await fn(req)
  return await res.json()
}

check('注册了 board 路由', Boolean(routes['/api/lifeboard/board']))
check('注册了 settings 路由', Boolean(routes['/api/lifeboard/settings']))

// 1) 默认板
let r = await call('/api/lifeboard/board', {})
let v = r.value
check('健康卡可用', v.health?.available === true, JSON.stringify({ w: v.health?.weightKg, p: v.health?.protein }))
check('体重解析 70.0', v.health?.weightKg === 70)
check('蛋白解析 26g（合计行）', v.health?.protein?.today?.grams === 26 && v.health.protein.today.partial === false)
check('任务卡有 1 条待办', v.tasks?.available === true && v.tasks.openCount === 1)
check('书架卡可用', v.shelf?.available === true && v.shelf.count === 1)
check('默认不含财务（敏感）', v.finance === undefined && v.assets === undefined)
check('五卡默认全开', JSON.stringify(v.cards) === JSON.stringify({ health: true, tasks: true, assets: true, mood: true, shelf: true }))

// 2) 财务/资产：带 include 才出
r = await call('/api/lifeboard/board', { include: ['finance'] })
v = r.value
check('include=finance 才下发资产', v.finance?.assets?.available === true)
check('资产合计 40 万', v.finance?.assets?.total === 40)
check('资产类别占比正确', v.finance?.assets?.groups?.length === 2 && v.finance.assets.groups[0].pct === 75)

// 3) 设置：读默认值
r = await call('/api/lifeboard/settings', { action: 'get' })
check('设置可读', r.ok === true && typeof r.value.logDir === 'string')

// 4) 设置：保存卡片开关 → 立刻生效（不重启）
r = await call('/api/lifeboard/settings', { action: 'save', values: Object.assign({}, r.value, { cards: { health: true, tasks: true, assets: true, mood: true, shelf: false } }) })
check('保存成功', r.ok === true)
r = await call('/api/lifeboard/board', {})
check('关掉书架后 board 立刻不显示', r.value.cards.shelf === false)

// 5) 改路径 → 立刻生效
r = await call('/api/lifeboard/settings', { action: 'get' })
const saved = r.value
r = await call('/api/lifeboard/settings', { action: 'save', values: Object.assign({}, saved, { logDir: '_assistant/life/log_missing' }) })
check('改路径能保存', r.ok === true)
r = await call('/api/lifeboard/board', {})
check('日志目录不存在 → 健康卡降级不报错', r.ok === true && (r.value.health === null || r.value.health.available === false))

// 6) 空 vault 不崩
const emptyVault = path.join(tmp, 'empty')
await mkdir(emptyVault, { recursive: true })
routes['/api/lifeboard/board'] = null
await plugin.apply(ctx, { vaultRoot: emptyVault, einkEnable: false })
r = await call('/api/lifeboard/board', {})
check('空 vault 返回 ok 且不抛错', r.ok === true)


// 6.5) 路径体检：逐项告诉用户找到没（2026-11-10）
r = await call('/api/lifeboard/probe', { values: {
  vaultRoot: vault,
  logDir: '_assistant/life/log',
  todoFile: '_assistant/TODO.md',
  assetsFile: '_assistant/life/private/资产快照.tsv',
  financeFile: '_assistant/life/private/消费流水.tsv',
  shelfDir: '_assistant/notes/书架',
} })
const probeItems = r.value?.items ?? []

check('体检返回各项', probeItems.length >= 4)
check('体检识别日志目录 ok', probeItems.find((i) => i.key === 'logDir')?.status === 'ok')
check('体检识别待办 ok', probeItems.find((i) => i.key === 'todoFile')?.status === 'ok')
check('体检识别资产表 ok', probeItems.find((i) => i.key === 'assetsFile')?.status === 'ok')

// 7) 示例数据预览（demoMode）：不读真实 vault，也能看到五卡效果
r = await call('/api/lifeboard/settings', { action: 'save', values: { demoMode: true } })
check('打开示例预览可保存', r.ok === true)
r = await call('/api/lifeboard/board', { include: ['finance'] })
check('示例模式标记为 demo', r.value.demo === true)
check('示例数据有健康卡', r.value.health?.available === true && Number.isFinite(r.value.health.weightKg))
check('示例数据有资产卡', r.value.finance?.assets?.available === true)
r = await call('/api/lifeboard/settings', { action: 'save', values: { demoMode: false, vaultRoot: '' } })
check('关闭示例预览', r.ok === true)


// 8) 解析容错：### 标题 / 全角数字 / 睡眠 h；缺文件给明确提示（2026-11-10）
const vault2 = path.join(tmp, 'vault2')
await mkdir(path.join(vault2, '_assistant', 'life', 'log'), { recursive: true })
await writeFile(path.join(vault2, '_assistant', 'TODO.md'), '# 待办\n\n- [ ] 容错测试 | 截止：2026-01-05\n')
await writeFile(path.join(vault2, '_assistant', 'life', 'log', `${todayKey}.md`), `# ${todayKey}

### 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **７１．５ kg** |
| 体脂率 | **２２．０%** |

### 睡眠

- 睡了 8h
`)
const routes2 = {}
const ctx2 = {
  effect(fn) { fn() },
  get(name) {
    if (name === 'connection') {
      return { fetch: { register({ path: p2, fetch }) { routes2[p2] = fetch } } }
    }
    return undefined
  },
  logger: { info() {}, warn() {}, error() {} },
}
await plugin.apply(ctx2, { vaultRoot: vault2, einkEnable: false })
const call2 = async (p2, body) => {
  const fn = routes2[p2]
  const req = new Request('http://localhost' + p2, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  return await (await fn(req)).json()
}
let v2 = (await call2('/api/lifeboard/board', {})).value
check('三级标题也能解析体重', v2.health?.weightKg === 71.5)
check('全角数字归一', v2.health?.vitals?.bodyFat === 22)
check('睡眠支持 8h 写法', v2.health?.sleepAvgHours === 8)
check('缺目录给出 no-file 提示（书架）', v2.shelf?.available === false && v2.shelf?.hint?.code === 'no-file')
const diag2 = (await call2('/api/lifeboard/board', {})).value.diagnostics ?? []
check('体检指出缺书架目录', diag2.some((d) => d.code === 'shelf-missing'))
check('体检给出可复制的示例格式', diag2.every((d) => typeof d.message === 'string' && typeof d.expect === 'string' && d.expect.length > 0))
check('有复选框的 TODO 不误报 todo-nobox', !diag2.some((d) => d.code === 'todo-nobox'))

await rm(tmp, { recursive: true, force: true })
const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
