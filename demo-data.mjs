/**
 * 内置示例数据：用户还没配好路径时，先看效果用。
 * 全部虚构（人物「小林」），不读任何真实目录。
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'

const d = (offset) => {
  const t = new Date()
  t.setDate(t.getDate() - offset)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
const weights = [72.4, 72.1, 71.8, 71.9, 71.4, 71.2, 70.9]
const protein = [96, 118, 132, 108, 141, 126, 134]
const mood = ['平和', '充实', '一般', '开心', '平和', '充实', '开心']
const exercise = [
  '慢跑 5.2 km，平均配速 6:10',
  '力量训练 40 分钟（深蹲 / 硬拉 / 划船）',
  '羽毛球 1 小时',
  '慢跑 4.0 km，轻松跑',
  '休息日：拉伸 15 分钟',
  '骑行 18.4 km',
  '力量训练 35 分钟（上肢）',
]
const meals = [
  ['燕麦 + 鸡蛋 2 个 + 牛奶', '鸡胸饭 + 西兰花', '清蒸鱼 + 杂粮饭'],
  ['全麦三明治 + 豆浆', '牛肉面（半碗）', '虾仁炒蛋 + 青菜'],
  ['鸡蛋 3 个 + 玉米', '番茄牛肉饭', '烤鸡腿 + 沙拉'],
  ['酸奶 + 坚果 + 香蕉', '三文鱼饭团', '豆腐汤 + 炒时蔬'],
  ['煎蛋 2 个 + 吐司', '鸡肉卷 + 拿铁', '麻辣香锅（少油）'],
  ['紫薯 + 鸡蛋 2 个 + 牛奶', '猪排饭（半份）', '清炒虾仁 + 米饭半碗'],
  ['三明治 + 美式', '牛肉沙拉', '烤鱼 + 西兰花'],
]

/** 生成一份示例 vault 到 dir（已存在则直接返回） */
const DEMO_VERSION = 2

export async function ensureDemoVault(dir, coverDir = '') {
  // 版本标记：升级示例数据结构时自动重建（否则老用户永远看到旧样例）
  try {
    const { readFile: rf } = await import('node:fs/promises')
    const v = Number((await rf(path.join(dir, '.demo-version'), 'utf8')).trim())
    const s = await stat(path.join(dir, '_assistant', 'TODO.md'))
    if (s.isFile() && v === DEMO_VERSION) return dir
    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
  } catch { /* 无标记或结构旧：重建 */ }

  const logDir = path.join(dir, '_assistant', 'life', 'log')
  const shelfDir = path.join(dir, '_assistant', 'notes', '书架')
  const privDir = path.join(dir, '_assistant', 'life', 'private')
  await mkdir(logDir, { recursive: true })
  await mkdir(shelfDir, { recursive: true })
  await mkdir(privDir, { recursive: true })

  for (let i = 6; i >= 0; i--) {
    const idx = 6 - i
    const today = d(i)
    await writeFile(path.join(logDir, `${today}.md`), `# ${today}

> 示例数据 · 非真实记录

## 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **${weights[idx]} kg** |
| 体脂率 | **${(21.8 + idx * 0.2).toFixed(1)}%** |
| 内脏脂肪 | **${idx < 3 ? 8 : 9} 级** |
| 骨盐率 | **4.1%** |
| 心率 | **${66 + (idx % 4)}** |

## 睡眠

- 睡了 ${(7.4 - idx * 0.2).toFixed(1)} 小时

## 情绪

- **${mood[idx]}**

## 饮食

- **早餐**：${meals[idx][0]}
  - 估算：蛋白 26g · 热量 460 kcal
  - **早餐合计：蛋白 ~26g · 热量 ~460 kcal**
- **午餐**：${meals[idx][1]}
  - 估算：蛋白 42g · 热量 780 kcal
  - **午餐合计：蛋白 ~42g · 热量 ~780 kcal**
- **晚餐**：${meals[idx][2]}
  - 估算：蛋白 46g · 热量 620 kcal
  - **晚餐合计：蛋白 ~46g · 热量 ~620 kcal**
- **今日累计（日终）**：蛋白 **~${protein[idx]}g** · 热量 **~1860 kcal**

## 运动

- **${exercise[idx]}**
`)
  }

  const today = d(0)
  await writeFile(path.join(dir, '_assistant', 'TODO.md'), `# 待办（示例数据）

- [ ] 📊 整理季度复盘材料 | 截止：${today} | #工作
- [ ] 🏥 预约年度体检 | 截止：${d(-2)} | #健康
- [ ] 📚 读完《系统之美》第 3 章 | 截止：${d(-4)} | #学习
- [ ] ✈️ 订下月出差机票 | 截止：${d(-6)} | #工作
- [ ] 🎁 给家里寄一箱水果 | 截止：${d(-9)} | #生活
- [x] 续费云服务器 | 完成：${today} | 反馈：已续
`)
  await writeFile(path.join(privDir, '资产快照.tsv'), `日期\t类别\t名称\t金额万
${today}\t基金\t全球股票指数\t32.0
${today}\t基金\t红利低波\t12.5
${today}\t基金\t债券基金\t6.0
${today}\t现金\t货币基金\t8.0
${today}\t现金\t活期\t3.5
`)
  await writeFile(path.join(privDir, '消费流水.tsv'), `日期\t类别\t金额元\t渠道\t备注
${today}\t餐饮\t32\t扫码\t午餐
${today}\t外食\t86\t到店\t晚饭
${today}\t交通\t9\t扫码\t地铁
`)
  // 示例书目：4 本真实书目（只放元数据，不放书摘正文）+ 2 本通用示例
  // 之所以不搬书摘原文：① 那是 leo 自己的笔记 ② 书摘属他人版权内容，不能随包分发
  const books = [
    ['认知觉醒', '周岭', '认知 / 自我管理', 20],
    ['被讨厌的勇气', '岸见一郎 / 古贺史健', '认知 / 心理', 22],
    ['蛤蟆先生去看心理医生', '罗伯特·戴博德', '心理', 24],
    ['纳瓦尔宝典：财富与幸福指南', '埃里克·乔根森', '财商 / 人生系统', 26],
    ['系统之美', '德内拉·梅多斯', '思维 / 系统', 30],
    ['思考，快与慢', '丹尼尔·卡尼曼', '心理 / 决策', 33],
  ]
  const lines = books.map(([title, author, category, ago]) =>
    `# ${title}\n\n> 作者：${author} · 分类：${category} · 级别：原文级 · 加入：${d(ago)}\n\n## 核心框架\n\n- 示例条目：这里放你自己的一句话摘要。\n`)
  for (let i = 0; i < books.length; i++) {
    await writeFile(path.join(shelfDir, `${books[i][0]}.md`), lines[i])
  }
  // 封面 1：插件自带的生成式封面（无版权，随包分发）
  try {
    const { readdir: rd, copyFile } = await import('node:fs/promises')
    const selfCover = new URL('./demo-covers/', import.meta.url).pathname
    const demoCover = path.join(dir, '_assistant', 'life', 'private', '书', '封面')
    await mkdir(demoCover, { recursive: true })
    for (const name of await rd(decodeURIComponent(selfCover)).catch(() => [])) {
      await copyFile(path.join(decodeURIComponent(selfCover), name), path.join(demoCover, name)).catch(() => {})
    }
  } catch { /* 没自带封面就退首字占位 */ }

  // 封面 2：用户自己的封面目录（本地覆盖，绝不随包分发）
  if (coverDir) {
    try {
      const { readdir: rd, copyFile } = await import('node:fs/promises')
      const demoCover = path.join(dir, '_assistant', 'life', 'private', '书', '封面')
      await mkdir(demoCover, { recursive: true })
      const files = await rd(coverDir).catch(() => [])
      for (const name of files) {
        if (!/\.(jpe?g|png|webp)$/i.test(name)) continue
        await copyFile(path.join(coverDir, name), path.join(demoCover, name)).catch(() => {})
      }
    } catch { /* 封面拷贝失败就用首字占位 */ }
  }
  await writeFile(path.join(dir, '.demo-version'), String(DEMO_VERSION))
  return dir
}
