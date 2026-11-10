/**
 * 规则抽取单测（M3）：每条规则至少一条正例 + 一条该漏的负例
 */
import { extractFromText, summarize } from '../lib/extract.mjs'

const results = []
const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const sample = `# 2026-11-10

## 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **69.5 kg** |
| 体脂率 | **22.1%** |
| 内脏脂肪 | **9 级** |
| 心率 | **68** |

## 饮食

- **早餐合计：蛋白 ~31g · 热量 ~570 kcal**
- 今日累计（日终）：蛋白 **~63g** · 热量 ~1400 kcal

## 运动

- 慢跑 5.2 km

## 情绪

- **开心**

## 待办

- [ ] 整理季度复盘 | 截止：2026-11-20
- [x] 续费服务器 | 完成：2026-11-09

目标体重 65kg
今天早上体重 69.9 公斤
`
const items = extractFromText(sample, { file: 'x.md' })
const get = (field, extra = () => true) => items.filter((i) => i.field === field && extra(i))

check('表格体重', get('weight', (i) => i.confidence === 'high')[0]?.value === 69.5)
check('体脂', get('bodyFat')[0]?.value === 22.1)
check('内脏脂肪', get('visceralFat')[0]?.value === 9)
check('心率', get('heartRate')[0]?.value === 68)
check('蛋白分 scope：合计/日终', get('protein', (i) => i.scope === 'mealTotal')[0]?.value === 31 && get('protein', (i) => i.scope === 'dayTotal')[0]?.value === 63)
check('运动里程', get('exercise')[0]?.value === 5.2)
check('情绪', get('mood')[0]?.value === '开心')
check('待办未完成', get('task', (i) => i.done === false).length === 1)
check('待办已完成', get('task', (i) => i.done === true).length === 1)
check('体重目标', get('weightGoal')[0]?.value === 65)
check('正文体重记为低可信', get('weight', (i) => i.confidence === 'low')[0]?.value === 69.9)
check('每条都带行号与原文', items.every((i) => typeof i.line === 'number' && typeof i.raw === 'string' && i.raw.length > 0))

// 负例：纯噪声不许抽出健康数字
const noise = extractFromText('## 随便写写\n\n今天是第 3 天，看了 25 页书，天气 18 度。\n', { file: 'n.md' })
check('噪声不误抽', noise.length === 0, JSON.stringify(noise))

const s = summarize(items)
check('汇总统计', s.total === items.length && s.low >= 1)

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
