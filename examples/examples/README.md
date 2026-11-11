# 示例 vault（三种笔记习惯）

选一套照抄即可，或直接用插件的「自动扫描」指向它：

| 目录 | 习惯 | 看点 |
|:--|:--|:--|
| `zh-diary/` | 中文日记流 | `## 健康` 表格 + 饮食清单 |
| `obsidian/` | Obsidian 模板流 | YAML frontmatter + `- 体重:: 69.5` 双冒号 + `#标签` |
| `en-journal/` | 英文 journal | `weight: 69.5kg`、`slept 7.5 hours` |

三套都能被同一个插件正确解析（`node test/samples.mjs` 用的就是这类异构样本）。
