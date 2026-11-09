# dsh-lifeboard · 人生看板

> 把散落在 markdown 里的日常，折成一块只读看板：**健康 · 任务 · 资产 · 情绪 · 书架**。
> 只读你已有的文件，不建数据库、不联云、财务卡默认不读。

[![npm](https://img.shields.io/npm/v/dsh-lifeboard.svg)](https://www.npmjs.com/package/dsh-lifeboard)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.2.1--rc.2-4D6BFE.svg)](https://www.npmjs.com/package/@deepseek-ai/dsh)

---

## 它解决什么

你每天在日志里记体重、在 TODO 里记待办、在表格里记资产——这些数据从来不会自己变成「一眼能看懂」的东西。

这个插件不做新东西：**只读**你已有的 markdown / tsv，按固定格式折叠成五张卡，挂在 DSH 侧边栏。它不改你的文件，唯一两个写入动作是「任务卡手动勾选」和「情绪一键打卡」，都要你自己点。

**和同类插件的区别**

| | 常见做法 | 这个插件 |
|:--|:--|:--|
| 数据来源 | 让你把数据搬进它的库 | 读你**已经在写**的 markdown |
| 覆盖范围 | 单个领域（任务 / 用量 / 健康） | 五域合一 |
| 隐私 | 默认全读 | 资产与支出**默认不读**，点 👁 才请求 |
| 上手 | 先配置才能看 | 内置示例数据，装完直接看效果 |

---

## 五张卡

| 卡 | 读什么 | 展示 |
|:--|:--|:--|
| 🩺 **健康** | 每日日志的「健康」表格 + 睡眠/运动段 | 体重（含较上次差值）、7 天趋势线、体脂 / 内脏脂肪 / 骨盐率 / 心率 / 睡眠 / 运动六格、蛋白达标环 |
| 📋 **任务** | TODO 文件的 `- [ ]` 行 | 按日期排序、逾期标红、`#标签` 分工作/生活；可点选完成或延期 |
| 💼 **资产** | 资产快照 TSV | SVG 环形饼图（按类别占比）+ top5 持仓 + 当月支出 |
| 🧠 **情绪·运动** | 日志的「情绪」「运动」段 | 7 天打卡点、连续天数、最新情绪；四个按钮一键打卡 |
| 📚 **书架** | 书架目录下的 `.md` | 书封、点开随机摘一句 |

---

## 快速开始

```bash
dsh plugin --profile <你的 profile> add dsh-lifeboard
```

或在 **插件 → 添加插件** 填 `dsh-lifeboard`。装完重启 DSH，侧边栏出现「人生看板」。

**还没配数据？** 打开 **设置 → 人生看板**，勾上「示例数据预览」——插件会在本地生成一份虚构人物的示例数据（7 天体重/三餐/情绪/运动、5 条待办、5 笔资产、6 本书），先看效果再配自己的路径。示例数据落在 `~/.dsh/storages/dsh-lifeboard/demo-vault/`，与真实目录完全隔离。

---

## 配置

全部可选，在 **设置 → 人生看板** 里改，或写进 profile 的 `cordis.patch.yml`：

```yaml
- id: lifeboard
  name: dsh-lifeboard
  config:
    vaultRoot: ""                              # 空 = 自动探测会话工作目录
    logDir: "_assistant/life/log"              # 每日日志目录，文件名 YYYY-MM-DD.md
    todoFile: "_assistant/TODO.md"
    assetsFile: "_assistant/life/private/资产快照.tsv"
    financeFile: "_assistant/life/private/消费流水.tsv"
    shelfDir: "_assistant/notes/书架"
    coverDir: "_assistant/life/private/书/封面"
    excerptDir: "_assistant/life/private/书/抽取"
    windowDays: 7                              # 统计窗口（天）
    proteinTarget: 130                         # 蛋白目标 g/天
    cards:                                     # 想关掉哪张就写 false
      health: true
      tasks: true
      assets: true
      mood: true
      shelf: true
    demoMode: false                            # 示例数据预览
    demoCoverDir: ""                           # 示例封面目录（本机图片，不随包分发）
    einkEnable: false                          # Kindle 只读任务页
    einkPort: 8788
    einkKindleDir: ""                          # Kindle 挂载点
```

路径都相对 `vaultRoot`；**文件不存在时对应卡片显示「暂无数据」，不会报错、不会白屏**。

---

## 数据格式

插件按固定格式解析，写歪了就是「暂无数据」——不是坏了，是格式没对上。

**每日日志** `logDir/YYYY-MM-DD.md`

```markdown
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

- 户外步行 2.0 km

## 饮食

- 早餐合计：蛋白 ~26g · 热量 ~330 kcal
- 今日累计（日终）：蛋白 **~130g**
```

蛋白支持三种写法：`今日累计：蛋白 ~130g` / `全天蛋白 ~130g` / 每餐 `合计：蛋白 ~30g`（逐餐相加）。

**待办** `todoFile`

```markdown
- [ ] 整理季度复盘 | 截止：2026-11-20 | #工作
- [x] 续费服务器 | 完成：2026-11-09
```

**资产** `assetsFile`（TSV，金额单位万元）

```text
日期	类别	名称	金额万
2026-11-09	基金	全球股票指数	32.0
2026-11-09	现金	货币基金	8.0
```

**书架** `shelfDir/<书名>.md`，第二行写元信息，封面放 `coverDir/<书名>.jpg`：

```markdown
# 系统之美

> 作者：德内拉·梅多斯 · 分类：思维类 · 级别：原文级 · 加入：2026-10-20

## 核心框架
- 系统的三个要件：要素、连接、目标。
```

---

## 隐私

- **数据不出本机**：插件只注册本机 HTTP 路由（`/api/lifeboard/*`），不请求任何第三方服务
- **敏感卡默认不读**：资产与支出要点 👁 才向宿主请求，且只在本机渲染
- **`private/` 不主动扫**：路径由你显式配置，不配就不读
- **包里没有数据**：安装包只有代码、生成式示例封面与文案

---

## 常见问题

**Q：装上看不到卡片？**
A：先看 **设置 → 人生看板** 里的路径对不对，再勾一次「示例数据预览」——示例能显示说明插件正常，问题在路径。

**Q：健康卡数字不对？**
A：检查日志「健康」段是不是 markdown 表格、行标签是否写成 `体重` / `体脂率` / `内脏脂肪` / `骨盐率` / `心率`。蛋白看「今日累计」或每餐「合计」行。

**Q：Kindle 页面打不开？**
A：默认关闭。打开需配置 `einkEnable: true` + 挂载点，**重启后**生效；访问 `http://<局域网IP>:8788/`，设置了 `~/.dsh/eink-token` 时要带 `?k=<token>`。

**Q：改设置要重启吗？**
A：路径与卡片开关**立即生效**；Kindle 服务开关与端口需要重启（服务只在启动时监听）。

**Q：会不会把我的数据传出去？**
A：不会。插件没有外发请求，读文件也只在你配置的目录里。

---

## 开发

```bash
git clone https://github.com/www945601002ktl-del/dsh-lifeboard.git
cd dsh-lifeboard
node test/smoke.mjs     # 不依赖 DSH 运行时：假 ctx + 假 vault，跑 23 项断言
```

测试覆盖：路由注册、健康/蛋白解析、任务计数、书架、敏感卡默认不读、`include:finance` 才下发、资产占比、设置读写、**保存后即时生效**、路径不存在降级、空 vault 不崩、示例数据模式。

---

## 兼容性

- 已测：`dsh 0.2.1-rc.2` ~ `0.2.2-rc.1`
- 依赖宿主两个能力：`connection.fetch.register`（本机路由）、客户端 `slots`（侧边栏 + 主面板 + 设置小节）
- 内核升级后若卡片不显示，先看 DSH 日志有没有 `lifeboard: ... route unavailable`

---

## License

MIT · 示例封面为程序生成的图形，不含任何第三方封面素材。
