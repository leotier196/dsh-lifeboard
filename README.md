# dsh-lifeboard · 人生看板

> 把散落在 markdown 里的日常，折成一块只读看板：**健康 · 任务 · 资产 · 情绪 · 书架**五张卡。
> 数据不出本机 · 财务卡默认不读 · 缺文件自动降级

![license](https://img.shields.io/badge/license-MIT-blue) ![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.2.1--rc.2-4D6BFE)

---

## 它解决什么

你每天在日志里记体重、在 TODO 里记待办、在表格里记资产——但这些数据从来不会自己变成"一眼能看懂"的东西。

这个插件做的事很简单：**只读**你已有的 markdown / tsv，按固定格式折叠成五张卡，挂在 DSH 侧边栏。它不新建数据源、不写数据库、不改你的文件（只有两个例外：任务卡可以手动勾选、情绪卡可以一键打卡）。

---

## 先看效果，再配路径

装完什么都还没配？在 **设置 → 人生看板** 勾上 **「示例数据预览」**，
插件会在本地生成一份虚构人物的示例数据（7 天体重/三餐/情绪/运动、5 条待办、5 笔资产、2 本书），
直接看到五张卡长什么样。觉得合适，关掉预览、填上自己的路径即可。

示例数据落在 `~/.dsh/storages/dsh-lifeboard/demo-vault/`，与你的真实目录完全隔离。

**封面**：示例里的书默认显示首字占位。想让预览带封面，在设置页填「示例封面目录」——
指向你自己的封面文件夹（文件名与书名一致），插件只在**本机**拷贝一份进去，**不会随包分发任何图片**。

## 五张卡

| 卡 | 读什么 | 你能看到 |
|:--|:--|:--|
| 🩺 **健康** | 每日日志的「健康」表格 + 睡眠/运动段 | 体重（含较上次差值）、7 天趋势线、体脂 / 内脏脂肪 / 骨盐率 / 心率 / 睡眠 / 运动六格、蛋白达标进度条 |
| 📋 **任务** | TODO 文件的 `- [ ]` 行 | 按日期排序的待办、逾期标红、`#标签` 分工作/生活；可点选完成或延期 |
| 💼 **资产** | 资产快照 TSV | SVG 环形饼图（按类别占比）+ top5 持仓 + 当月支出 |
| 🧠 **情绪·运动** | 日志的「情绪」「运动」段 | 7 天打卡点、连续天数、最新情绪；四个按钮一键打卡 |
| 📚 **书架** | 书架目录下的 `.md` | 书封、点开随机摘一句 |

---

## 安装

```bash
dsh plugin --profile <你的 profile> add dsh-lifeboard
```

或在 **插件 → 添加插件** 里填 `dsh-lifeboard`。装完重启 DSH。

---

## 设置页

装好后打开 **设置 → 人生看板**（与「插件」并列的小节），可以改：

- 数据源路径（日志目录 / TODO / 资产表 / 消费流水 / 书架 / 封面 / 书摘）
- 统计窗口天数、蛋白目标
- 五张卡各自的开关
- Kindle 只读任务页（开关 + 挂载点）

保存后写进 `~/.dsh/storages/dsh-lifeboard/settings.json`，**路径与卡片开关立刻生效**（刷新看板即可）；
**Kindle 页的开关与端口要重启 DSH 才生效**（服务只在启动时监听一次）。

也可以不改设置页、直接在 profile 的 `cordis.patch.yml` 里写默认值（设置页保存的值优先）。

## 配置（全部可选）

```yaml
- id: lifeboard
  name: dsh-lifeboard
  config:
    vaultRoot: ""                              # 空 = 自动探测
    logDir: "_assistant/life/log"              # 每日日志目录，文件名 YYYY-MM-DD.md
    todoFile: "_assistant/TODO.md"             # 待办
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
    einkEnable: false                          # Kindle 只读任务页，默认关
    einkPort: 8788
    einkKindleDir: ""                          # 挂了 Kindle 才填挂载点
```

**格式要求**（插件按这些格式解析，写歪了就显示"暂无数据"）：

- 日志：`## 健康` 段里用 markdown 表格，行标签写 `体重` / `体脂率` / `内脏脂肪` / `骨盐率` / `心率`
- 蛋白：`今日累计：蛋白 ~130g` 或 `全天蛋白 ~130g`，或每餐 `合计：蛋白 ~30g`
- 资产：TSV，列 `日期	类别	名称	金额万`
- 书架：`notes/书架/<书名>.md`，封面放 `coverDir/<书名>.jpg`

---

## 隐私

- **零外发**：插件只注册本机 HTTP 路由（`/api/lifeboard/*`），不请求任何第三方服务（唯一的例外是任务页顶栏的余额显示，读本机 `DEEPSEEK_API_KEY` 后直连 DeepSeek 官方接口，可关）
- **敏感卡默认不读**：资产与支出要点 👁 才向宿主请求，且只在本机渲染
- **包里没有数据**：安装包只有代码与文案

---

## 已知限制

- 解析是**基于固定格式**的，不是 AI 理解；换个写法就不认
- 只支持 macOS / Linux 的纯文本源；不连券商、不做净值换算
- 内核升级可能影响 `connection` 路由与客户端注入，`dsh.engines` 已声明已测版本

---

## English

A read-only dashboard plugin for DeepSeek Harness: folds your markdown daily logs, TODO list and asset table into five cards (health, tasks, assets, mood, bookshelf). Everything stays local; the finance card is opt-in. Install with `dsh plugin add dsh-lifeboard`.
