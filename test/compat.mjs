/**
 * 兼容层单测：不同写法 → 同一份标准字段（2026-11-10 M2）
 * 用法：node test/compat.mjs
 */
import { findMetric, parseHealth, toStandard } from '../lib/parse.mjs'

const results = []
const check = (name, ok, extra = '') => {
  results.push([name, ok])
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
}

// 1) 单位换算
check('斤 → kg', toStandard('weight', 138, '斤') === 69)
check('分钟 → 小时', toStandard('sleep', 450, '分钟') === 7.5)
check('米 → 公里', toStandard('exercise', 5200, 'm') === 5.2)
check('磅 → kg', Math.abs(toStandard('weight', 153, 'lb') - 69.4) < 0.15)

// 2) 表格格式（原有能力，必须保持）
const tableStyle = `## 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **69.5 kg** |
| 体脂率 | **22.1%** |
| 内脏脂肪 | **9 级** |
| 骨盐率 | **4.0%** |
| 心率 | **68** |
`
const t1 = parseHealth(tableStyle)
check('表格：体重', t1.weight === 69.5, String(t1.weight))
check('表格：体脂', t1.bodyFat === 22.1, String(t1.bodyFat))
check('表格：内脏脂肪', t1.visceralFat === 9, String(t1.visceralFat))
check('表格：心率', t1.heartRate === 68, String(t1.heartRate))

// 3) 键值格式（很多人不用表格）
const kvStyle = `## 健康

- **体重**：69.5 kg
- 体脂率: 22.1%
- 内脏脂肪：9 级
- 心率=68
`
const t2 = parseHealth(kvStyle)
check('键值：体重', t2.weight === 69.5, String(t2.weight))
check('键值：体脂', t2.bodyFat === 22.1, String(t2.bodyFat))
check('键值：心率（等号）', t2.heartRate === 68, String(t2.heartRate))

// 4) 列表式 / 英文
const listStyle = `## Health

- weight: 152.8 lb
- sleep 7.5h
- run 5.2 km
`
const t3 = parseHealth(listStyle, { allowLow: true })
check('英文：weight lb → kg', Math.abs((t3.weight ?? 0) - 69.3) < 0.3, String(t3.weight))
check('英文：sleep 7.5h', t3.sleep === 7.5, String(t3.sleep))

// 5) 中文列表
const cnList = `## 健康

- 体重 69.5 公斤
- 睡了 7.5 小时
- 跑步 5.2 公里
`
const t4 = parseHealth(cnList)
check('列表：体重', t4.weight === 69.5, String(t4.weight))
check('列表：睡眠', t4.sleep === 7.5, String(t4.sleep))

// 6) 低可信度默认不采用，允许时才用
const inline = '今天早上称了一下，体重 69.5 kg，感觉还行。'
const strict = parseHealth(inline)
const loose = parseHealth(inline, { allowLow: true })
check('正文里飘的体重：默认不采用', strict.weight === undefined)
check('正文里飘的体重：allowLow 才采用', loose.weight === 69.5, String(loose.weight))

// 7) 不能把无关数字当体重（误读为 0 是红线）
const noise = `## 健康

今天是第 3 天，跑了 5 公里。
`
const t6 = parseHealth(noise, { allowLow: true })
check('噪声段不误读体重', t6.weight === undefined, JSON.stringify(t6))

// 8) 显式 findMetric 的置信度
const conf = findMetric('体重：69.5 kg', 'weight')
check('键值识别为高可信', conf && conf.confidence === 'high')

await (async () => {
  const failed = results.filter(([, ok]) => !ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
