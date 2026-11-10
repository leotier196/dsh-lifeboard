/**
 * 人生看板 · 客户端半（M2：健康/任务/财务/行程/书架）
 *
 * - sidebar.panellist 注册「人生看板」入口图标（id: lifeboard）
 * - main 注册同键主面板：五张卡片，大数指标 + 迷你趋势 + 状态徽章
 * - 数据来自宿主半 POST /api/lifeboard/board（只读 vault 折叠结果）
 * - 刷新：挂载即拉取 + 可见状态每 60s + 手动刷新；行程走日历代理，手动触发
 */
window.__ModuleLoader__.load({
  id: 'dsh-lifeboard',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const NS = 'lifeboard'
    const PANEL_KEY = 'lifeboard'

    const DICTS = {
      zh: {
        'panel.title': '人生看板',
        'panel.eyebrow': 'LIFE BOARD',
        'panel.subtitle': '只读你的笔记 · 自动刷新',
        'panel.refresh': '刷新',
        'panel.refreshing': '刷新中…',
        'panel.updated': '更新于 {t}',
        'panel.dataAbsent': '数据缺席',
        'panel.noFile': '找不到文件：{path}',
        'panel.noRecent': '目录里没有近几天的日志',
        'panel.format': '文件在，但没读到 {detail}（格式见 README）',
        'panel.vaultMissing': '没找到资料目录（里面要有 TODO.md）—— 去「设置 → 人生看板」指定，或点上面的「自动扫描」',
        'panel.loadFailed': '加载失败',
        'panel.diagnose': '格式体检',
        'panel.diagnoseHint': '下面这些地方跟插件约定不一致，所以对应卡片读不到数据；按右侧示例改一下即可。',
        'panel.copyTemplate': '复制示例',
        'settings.aliasTitle': '字段映射（可选）',
        'settings.aliasHint': '每行一条，左边是标准字段，右边是你的写法（逗号分隔）。改完保存即生效。',
        'settings.aliasPlaceholder': '体重：我的体重, wt\n睡眠：睡眠时间',
        'settings.advanced': '高级：手动指定路径',
        'settings.advancedHint': '一般不用改——上面的自动扫描会把它们填好。',
        'settings.scan': '自动扫描数据源',
        'settings.scanning': '扫描中…',
        'settings.scanHint': '在你指定的资料目录里找日志/待办/资产/书架，找到的直接一键填上',
        'settings.scanEmpty': '没找到明显的数据源；可以手动填，或先建一个日志目录',
        'settings.useThis': '用这个',
        'settings.useAll': '全部采用',
        'settings.probe': '检查这些路径',
        'settings.probing': '检查中…',
        'settings.probeHint': '按上面填的值直接查，不用先保存',
        'panel.expand': '展开',
        'panel.collapse': '收起',
        'panel.templateTitle': '格式示例（点开照抄）',
        'panel.templateHint': '插件按固定格式解析；下面四段就是它认的样子，复制改成自己的即可。',
        'health.title': '健康',
        'health.weight': '体重',
        'health.noCompare': '无对比',
        'health.visceralFat': '内脏脂肪',
        'health.sleep': '近 7 天睡眠',
        'health.sleepDaysSuffix': '天有记录',
        'health.exercise': '近 7 天运动',
        'health.exerciseSuffix': '次',
        'health.trend': '近 7 天体重',
        'health.bodyFat': '体脂率',
        'health.boneSalt': '骨盐率',
        'health.heartRate': '心率',
        'health.bmi': 'BMI',
        'health.goal': '减脂进度（相对起点）',
        'health.goalTarget': '目标 {n} kg',
        'health.goalDetail': '较起点 {lost} kg · 目标 {goal} kg · 完成 {pct}%',
        'health.protein': '今日蛋白',
        'health.proteinHit': '达标 {n} 天 · 完整 {m} 天',
        'health.proteinPartial': '截至当前',
        'health.proteinToday': '今日蛋白',
        'mood.streak': '连续 {n} 天',
        'mood.week': '近 7 天打卡',
        'mood.title': '情绪 · 运动',
        'mood.days': '本周情绪记录',
        'mood.unitDays': '天',
        'mood.latest': '最新情绪',
        'mood.km': '近 7 天里程',
        'mood.kmUnit': 'km',
        'mood.checkin': '一键打卡',
        'finance.investTotal': '定投累计',
        'tasks.title': '任务',
        'tasks.open': '未完成',
        'tasks.unitItems': '条',
        'tasks.undatedSuffix': '条无日期',
        'tasks.overdueCount': '已过期 {n}',
        'tasks.more': '还有 {n} 条未列出',
        'tasks.noDated': '没有带日期的待办',
        'tasks.work': '工作',
        'tasks.life': '生活',
        'tasks.done': '完成',
        'tasks.postpone': '延期 1 天',
        'tasks.doneConfirm': '确认完成这条任务？将写入 TODO.md（有备份）',
        'tasks.actionFail': '操作失败',
        'date.today': '今天',
        'date.tomorrow': '明天',
        'date.yesterday': '昨天',
        'date.inDays': '{n} 天后',
        'date.daysAgo': '{n} 天前',
        'assets.title': '资产',
        'assets.total': '总资产',
        'assets.asOf': '快照',
        'assets.unitWan': '万',
        'finance.title': '财务',
        'finance.show': '财务 👁',
        'finance.hide': '财务 ✓',
        'finance.toggleHint': '财务数据默认隐藏；点一下才向宿主请求（本机渲染，不上传）',
        'finance.month': '本月支出',
        'finance.invest': '定投（不计支出）',
        'finance.eatOut': '外食/外卖',
        'finance.latest': '最近一笔',
        'finance.unitTimes': '次',
        'finance.noAmount': '金额未记',
        'shelf.title': '书架',
        'shelf.count': '在库',
        'shelf.original': '原文级',
        'shelf.latest': '最近入库',
        'shelf.excerpt': '换一条',
        'shelf.close': '关闭',
        'shelf.loading': '摘取中…',
        'shelf.unitBooks': '本',
        'source.health': '源：life/log/{date}.md',
        'source.tasks': '源：TODO.md',
        'source.finance': '源：life/private/消费流水.tsv',
        'source.shelf': '源：notes/书架/*.md',
      },
      en: {
        'panel.title': 'Life Board',
        'panel.eyebrow': 'LIFE BOARD',
        'panel.subtitle': 'Read-only notes · auto refresh',
        'panel.refresh': 'Refresh',
        'panel.refreshing': 'Refreshing…',
        'panel.updated': 'updated {t}',
        'panel.dataAbsent': 'Data absent',
        'panel.noFile': 'File not found: {path}',
        'panel.noRecent': 'No logs in the last few days',
        'panel.format': 'File found, but no {detail} parsed (see README for the format)',
        'panel.vaultMissing': 'Notes folder not found (needs TODO.md) — set it in Settings → Lifeboard, or hit Auto-detect',
        'panel.loadFailed': 'Load failed',
        'panel.diagnose': 'Format check',
        'panel.diagnoseHint': 'These spots do not match what the plugin expects, so the cards stay empty. Fix them against the sample on the right.',
        'panel.copyTemplate': 'Copy sample',
        'settings.aliasTitle': 'Field aliases (optional)',
        'settings.aliasHint': 'One per line: standard field on the left, your own labels on the right (comma separated). Saving applies it.',
        'settings.aliasPlaceholder': 'weight: my weight, wt\nsleep: sleep time',
        'settings.advanced': 'Advanced: set paths manually',
        'settings.advancedHint': 'Usually unnecessary — Auto-detect fills these in.',
        'settings.scan': 'Auto-detect sources',
        'settings.scanning': 'Scanning…',
        'settings.scanHint': 'Looks inside your notes folder for logs, todos, assets and bookshelf, then fills them in',
        'settings.scanEmpty': 'Nothing obvious found — fill the paths manually or create a log folder first',
        'settings.useThis': 'Use',
        'settings.useAll': 'Use all',
        'settings.probe': 'Check these paths',
        'settings.probing': 'Checking…',
        'settings.probeHint': 'Uses the values above without saving first',
        'panel.expand': 'Show',
        'panel.collapse': 'Hide',
        'panel.templateTitle': 'Format samples (click to expand)',
        'panel.templateHint': 'The parser expects these exact shapes. Copy a block and edit it.',
        'health.title': 'Health',
        'health.weight': 'Weight',
        'health.noCompare': 'no comparison',
        'health.visceralFat': 'Visceral fat',
        'health.sleep': 'Sleep avg this week',
        'health.sleepDaysSuffix': 'days logged',
        'health.exercise': 'Workouts (7d)',
        'health.exerciseSuffix': '',
        'health.trend': 'Weight, last 7 days',
        'health.bodyFat': 'Body fat',
        'health.boneSalt': 'Bone salt',
        'health.heartRate': 'Heart rate',
        'health.bmi': 'BMI',
        'health.goal': 'Fat-loss progress (vs start)',
        'health.goalTarget': 'goal {n} kg',
        'health.goalDetail': 'vs start {lost} kg · goal {goal} kg · {pct}% done',
        'health.protein': '今日蛋白',
        'health.proteinHit': '达标 {n} 天 · 完整 {m} 天',
        'health.proteinPartial': '截至当前',
        'health.proteinToday': '今日蛋白',
        'mood.streak': '连续 {n} 天',
        'mood.week': '本周打卡',
        'mood.title': 'Mind · Workout',
        'mood.days': 'Mood logged this week',
        'mood.unitDays': 'days',
        'mood.latest': 'Latest mood',
        'mood.km': 'Distance (7d)',
        'mood.kmUnit': 'km',
        'mood.checkin': '一键打卡',
        'finance.investTotal': 'Invested total',
        'tasks.title': 'Tasks',
        'tasks.open': 'Open',
        'tasks.unitItems': 'items',
        'tasks.undatedSuffix': 'undated',
        'tasks.overdueCount': '{n} overdue',
        'tasks.more': '{n} more not listed',
        'tasks.noDated': 'No dated open items',
        'date.today': 'Today',
        'date.tomorrow': 'Tomorrow',
        'date.yesterday': 'Yesterday',
        'date.inDays': 'In {n} days',
        'date.daysAgo': '{n} days ago',
        'assets.title': 'Assets',
        'assets.total': 'Total assets',
        'assets.asOf': 'As of',
        'assets.unitWan': '10k CNY',
        'finance.title': 'Finance',
        'finance.show': 'Finance 👁',
        'finance.hide': 'Finance ✓',
        'finance.toggleHint': 'Finance is hidden by default; click to request it from the host (local only)',
        'finance.month': 'Spent this month',
        'finance.invest': 'Invested (excluded)',
        'finance.eatOut': 'Eating out',
        'finance.latest': 'Latest entry',
        'finance.unitTimes': 'times',
        'finance.noAmount': 'amount not recorded',
        'shelf.title': 'Bookshelf',
        'shelf.count': 'In library',
        'shelf.original': 'full-text',
        'shelf.latest': 'Latest added',
        'shelf.excerpt': 'Another one',
        'shelf.close': 'Close',
        'shelf.loading': 'Picking…',
        'shelf.unitBooks': 'books',
        'source.health': 'Source: life/log/{date}.md',
        'source.tasks': 'Source: TODO.md',
        'source.finance': 'Source: life/private/消费流水.tsv',
        'source.shelf': 'Source: notes/书架/*.md',
      },
    }

    // ---------- 样式（仅 --dsw-alias-* 令牌，lb- 前缀） ----------
    const CSS = `
.lb-root{box-sizing:border-box;min-width:0;height:100%;overflow-y:auto;padding:26px 30px 34px;color:var(--dsw-alias-label-primary)}
.lb-root *,.lb-root *:before,.lb-root *:after{box-sizing:border-box}
.lb-wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.lb-head{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.lb-head-main{min-width:0}
.lb-eyebrow{font:600 10px/1.2 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.16em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
.lb-title{margin:2px 0 0;font-size:20px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.lb-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.lb-head-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.lb-updated{font:500 10.5px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lb-refresh{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 12px;cursor:pointer;transition:color .15s,border-color .15s,background-color .15s}
.lb-refresh:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-border-l2))}
.lb-refresh:disabled{opacity:.55;cursor:default}
.lb-toggle{font:inherit;font-size:11.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));background:transparent;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:4px 10px;cursor:pointer;transition:color .15s,border-color .15s,background-color .15s}
.lb-toggle:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-border-l2))}
.lb-toggle-on{color:var(--dsw-alias-state-warning-primary,#f79009);border-style:solid;border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f79009) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f79009) 8%,transparent)}
.lb-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}
.lb-note{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0}
.lb-warn{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-primary));font-weight:600}
.lb-note{overflow-wrap:anywhere}
.lb-settings{display:flex;flex-direction:column;gap:10px;max-width:560px}
.lb-field{display:flex;flex-direction:column;gap:4px;font-size:12px}
.lb-field-k{color:var(--dsw-alias-label-secondary)}
.lb-field-row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}
.lb-input{padding:6px 8px;border:1px solid var(--dsw-alias-border-default,#d0d5dd);border-radius:6px;background:transparent;color:inherit;font-size:12px;min-width:220px}
.lb-cards{display:flex;gap:14px;flex-wrap:wrap;font-size:12px}
.lb-check{display:flex;align-items:center;gap:6px;font-size:12px}
.lb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px}
.lb-diagnose{margin-bottom:14px}
.lb-scan{padding:10px 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 26%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 5%,transparent)}
.lb-scan-btn{font-weight:600}
.lb-scan-all{margin-top:8px;font-size:11.5px;padding:3px 10px}
.lb-scan-row{display:flex;align-items:center;gap:7px;min-width:0;font-size:11.5px;padding:2px 0}
.lb-scan-key{flex:none;font:600 10.5px/1.4 var(--ds-font-family-code,ui-monospace,Menlo,monospace);color:var(--dsw-alias-label-secondary);min-width:74px}
.lb-textarea{min-height:86px;resize:vertical;font:500 11.5px/1.6 var(--ds-font-family-code,ui-monospace,Menlo,monospace)}
.lb-probe-row{align-items:center}
.lb-probe{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;font-size:11.5px}
.lb-probe-row-item{display:flex;align-items:center;gap:7px;min-width:0}
.lb-probe-dot{flex:none;width:7px;height:7px;border-radius:50%}
.lb-probe-ok{background:var(--dsw-alias-state-success-primary,#12b76a)}
.lb-probe-empty{background:var(--dsw-alias-state-warning-primary,#f79009)}
.lb-probe-missing{background:var(--dsw-alias-state-error-primary,#f04438)}
.lb-probe-format{background:var(--dsw-alias-state-warning-primary,#f79009)}
.lb-probe-path{flex:none;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.lb-probe-detail{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-tpl{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px}
.lb-tpl summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lb-tpl-item{margin-top:10px}
.lb-tpl-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
.lb-tpl-file{font:500 10.5px/1.5 var(--ds-font-family-code,ui-monospace,Menlo,monospace);color:var(--dsw-alias-label-secondary)}
.lb-tpl-copy{margin-left:auto;padding:2px 8px;font-size:11px}
.lb-tpl-body{margin:6px 0 0;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 80%,transparent);font:500 11px/1.6 var(--ds-font-family-code,ui-monospace,Menlo,monospace);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.lb-diag-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.lb-diag{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent);border:1px solid var(--dsw-alias-border-l2)}
.lb-diag-msg{font-size:12.5px;color:var(--dsw-alias-label-primary)}
.lb-diag-expect{display:block;font:500 11px/1.5 var(--ds-font-family-code,ui-monospace,Menlo,monospace);color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}

.lb-card{--lb-accent:var(--dsw-alias-brand-primary,#4d6bfe);position:relative;min-width:0;display:flex;flex-direction:column;gap:12px;padding:20px 22px 18px;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 80%,transparent);border-radius:18px;background:var(--dsw-alias-bg-layer-1);transition:border-color .15s,box-shadow .15s,transform .15s;overflow:hidden}
.lb-card:before{display:none}
.lb-card:hover{border-color:color-mix(in srgb,var(--dsw-alias-border-l2) 40%,var(--dsw-alias-label-tertiary,transparent));box-shadow:0 6px 20px color-mix(in srgb,var(--color-neutral-500) 8%,transparent);transform:translateY(-1px)}
.lb-card-head{display:flex;align-items:center;gap:8px;min-width:0}
.lb-card-icon{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:14px;background:color-mix(in srgb,var(--lb-accent) 11%,transparent);border:1px solid color-mix(in srgb,var(--lb-accent) 26%,transparent);flex:none}
.lb-card-title{margin:0;font-size:15px;font-weight:600;letter-spacing:0;white-space:nowrap}
.lb-card-tag{margin-left:auto;font:500 10px/1.4 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap}
.lb-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#12b76a);flex:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 18%,transparent)}
.lb-dot-idle{background:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));box-shadow:none}

.lb-metric{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0}
.lb-big{font:700 32px/1 -apple-system,"SF Pro Text","PingFang SC",var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-variant-numeric:tabular-nums;letter-spacing:-.035em}
.lb-unit{font-size:11px;color:var(--dsw-alias-label-secondary)}
.lb-metric-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;max-width:100%;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.lb-asset-row{display:flex;align-items:center;gap:14px;margin:2px 0 8px}
.lb-donut{flex:0 0 auto;width:112px;height:112px}
.lb-donut-num{fill:var(--dsw-alias-label-primary,#111);font-size:19px;font-weight:700;font-family:inherit}
.lb-donut-unit{fill:var(--dsw-alias-label-secondary);font-size:9px;font-family:inherit}
.lb-asset-legend{list-style:none;margin:0;padding:0;flex:1 1 auto;min-width:0}
.lb-legend-row{display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.9;white-space:nowrap}
.lb-legend-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.lb-legend-name{color:var(--dsw-alias-label-primary,#111);overflow:hidden;text-overflow:ellipsis}
.lb-legend-val{margin-left:auto;font-weight:600;color:var(--dsw-alias-label-primary,#111)}
.lb-legend-amt{color:var(--dsw-alias-label-secondary);font-size:11px;min-width:58px;text-align:right}
.lb-metric{overflow:hidden}
.lb-delta{display:inline-flex;align-items:center;gap:2px;font:600 10.5px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.lb-delta-down{color:var(--dsw-alias-state-success-primary,#12b76a);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 8%,transparent)}
.lb-delta-up{color:var(--dsw-alias-state-error-primary,#f04438);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 7%,transparent)}

.lb-goal{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:none}
.lb-ring{width:44px;height:44px;display:block}
.lb-ring circle{transition:stroke-dashoffset .4s}
.lb-ring-text{font:700 9px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);fill:var(--dsw-alias-label-primary)}
.lb-goal-text{display:flex;flex-direction:column;line-height:1.25}
.lb-goal-text b{font:650 12px/1.2 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace)}
.lb-goal-text small{font-size:9.5px;color:var(--dsw-alias-label-secondary)}
.lb-protein{display:flex;flex-direction:column;gap:5px;min-width:0;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 70%,transparent);border:1px solid var(--dsw-alias-border-l2)}
.lb-protein-head{display:flex;align-items:baseline;gap:6px;min-width:0;flex-wrap:wrap}
.lb-protein-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.lb-protein-foot .lb-protein-hit{flex:none;white-space:nowrap}
.lb-protein-avg{font:700 15px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-variant-numeric:tabular-nums}
.lb-protein-avg small{font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.lb-protein-dots{display:inline-flex;gap:4px;flex:none}
.lb-pdot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-l2)}
.lb-pdot-hit{background:var(--dsw-alias-state-success-primary,#12b76a)}
.lb-pdot-miss{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f79009) 70%,transparent)}
.lb-pdot-partial{background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f79009) 65%,transparent)}
.lb-pdot-none{background:var(--dsw-alias-border-l2);opacity:.5}
.lb-protein-bar{display:block;width:100%;height:5px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-border-l2) 55%,transparent);overflow:hidden}
.lb-protein-bar i{display:block;height:100%;background:var(--lb-accent);border-radius:999px;transition:width .3s}
.lb-protein-bar i.lb-protein-bar-hit{background:var(--dsw-alias-state-success-primary,#12b76a)}
.lb-mood-dots{display:flex;gap:5px;padding-top:2px}
.lb-mdot{width:12px;height:6px;border-radius:2px;background:var(--dsw-alias-border-l2);opacity:.6}
.lb-mdot-on{background:var(--lb-accent);opacity:1}
.lb-protein-hit{flex:none;font-size:10.5px}
.lb-checkin{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:2px}
.lb-checkin .lb-stat-k{flex:none}
.lb-checkin-btn{font:inherit;font-size:11.5px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color .15s,border-color .15s}
.lb-checkin-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-border-l2))}
.lb-checkin-btn:disabled{opacity:.5;cursor:default}
.lb-spark-wrap{position:relative;height:38px}
.lb-spark{width:100%;height:38px;display:block;color:var(--lb-accent);opacity:.95}
.lb-spark-tip{position:absolute;top:0;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px 8px;border-radius:7px;color:#fff;background:color-mix(in srgb,var(--lb-accent) 84%,#000 16%);white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px color-mix(in srgb,#000 18%,transparent)}
.lb-spark-tip-d{font:500 9.5px/1.2 var(--ds-font-family-code,ui-monospace,Menlo,monospace);opacity:.78;font-style:normal}
.lb-spark-tip-v{font:700 11.5px/1.25 var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-variant-numeric:tabular-nums}
.lb-spark-dot-hot{width:9px;height:9px;box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1)}
.lb-spark-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:currentColor;color:var(--lb-accent);transform:translate(-50%,-50%);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 3px color-mix(in srgb,var(--lb-accent) 25%,transparent)}
.lb-spark-empty{height:34px;border-radius:6px;background:repeating-linear-gradient(90deg,var(--dsw-alias-border-l2) 0 1px,transparent 1px 12px);opacity:.5}
.lb-spark-label{font:500 9.5px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.08em;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));text-transform:uppercase}

.lb-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
.lb-stats-6{grid-template-columns:repeat(3,minmax(0,1fr))}
.lb-stat-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 40%,transparent)}
.lb-stat-warn .lb-stat-v{color:var(--dsw-alias-state-error-primary,#f04438)}
.lb-groups{display:flex;flex-direction:column;gap:4px;min-width:0}
.lb-group{min-width:0}
.lb-group-head{display:flex;align-items:baseline;gap:6px;padding:5px 0 2px;font:600 10px/1.4 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.12em;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lb-group-n{font-weight:500;opacity:.75}
.lb-group .lb-rows .lb-row:first-child{border-top:0}
.lb-row-actions{margin-left:auto;flex:none;display:inline-flex;gap:3px;opacity:0;transition:opacity .15s}
.lb-task-row:hover .lb-row-actions{opacity:1}
.lb-act{font:inherit;font-size:11px;line-height:1;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer}
.lb-act:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-border-l2))}
.lb-act-done:hover{color:var(--dsw-alias-state-success-primary,#12b76a);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 40%,transparent)}
.lb-stat{min-width:0;overflow:hidden;padding:8px 9px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 70%,transparent);transition:border-color .15s,background-color .15s}
.lb-stat:hover{border-color:color-mix(in srgb,var(--lb-accent,var(--dsw-alias-brand-primary)) 30%,var(--dsw-alias-border-l2))}
.lb-stat-k{display:block;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-stat-v{display:block;max-width:100%;margin-top:2px;overflow:hidden;text-overflow:ellipsis;font:650 14px/1.2 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-variant-numeric:tabular-nums;white-space:nowrap}
.lb-stat-v small{font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-left:2px}

.lb-rows{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:1px}
.lb-row{display:flex;align-items:baseline;gap:8px;min-width:0;overflow:hidden;padding:4px 0;font-size:12.5px}
.lb-row + .lb-row{border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 65%,transparent)}
.lb-k{flex:none;color:var(--dsw-alias-label-secondary);font-size:11.5px;min-width:64px}
.lb-v{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-task-row{align-items:center}
.lb-chip{flex:none;font:600 10px/1.6 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);border-radius:999px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 80%,transparent)}
.lb-chip-warn{color:var(--dsw-alias-state-error-primary,#f04438);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 38%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f04438) 7%,transparent)}
.lb-task{flex:1;min-width:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.lb-dim{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lb-src{margin:auto 0 0;padding:8px 0 0;width:100%;text-align:left;background:none;border:0;cursor:pointer;font:500 9.5px/1.4 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}
.lb-src:hover{color:var(--dsw-alias-brand-primary,#4d6bfe);text-decoration:underline dotted}
.lb-card-wide{grid-column:1 / -1}
.lb-shelf{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:12px}
.lb-book{display:flex;flex-direction:column;gap:6px;min-width:0}
.lb-cover{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);box-shadow:0 3px 10px color-mix(in srgb,var(--color-neutral-500) 16%,transparent);background:var(--dsw-alias-bg-layer-2);transition:transform .18s,box-shadow .18s}
.lb-book:hover .lb-cover{transform:translateY(-2px) scale(1.02);box-shadow:0 8px 20px color-mix(in srgb,var(--color-neutral-500) 24%,transparent)}
.lb-cover-fallback{display:grid;place-items:center;aspect-ratio:2/3;font:600 11px/1.4 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--dsw-alias-label-secondary);text-align:center;padding:6px}
.lb-book-name{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.lb-book{cursor:pointer}
.lb-book:hover .lb-cover{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 55%,transparent);outline-offset:1px}
.lb-book-on .lb-cover{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}
.lb-quote{margin:2px 0 0;padding:10px 12px;border-left:3px solid var(--lb-accent);border-radius:0 10px 10px 0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 65%,transparent);display:flex;flex-direction:column;gap:6px;min-width:0}
.lb-quote-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lb-quote-src{font-size:10.5px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-quote-actions{margin-left:auto;display:inline-flex;gap:4px}
.lb-quote-text{margin:0;font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.lb-trip-empty{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.lb-icon{display:block}
`

    // ---------- 侧边栏图标 ----------
    function BoardIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 22
      const active = props.active === true
      return h('svg', {
        className: 'lb-icon',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', color: active ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'currentColor' },
      },
        h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M6.5 12.5h2.4l1.4-3.2 2.2 5.4 1.5-3.2h3.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    // ---------- 数据 ----------
    async function fetchBoard(include) {
      const payload = Array.isArray(include) && include.length > 0 ? JSON.stringify({ include }) : '{}'
      const res = await fetch('api/lifeboard/board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const body = await res.json()
      if (body && body.ok === true) return body.value
      throw new Error((body && body.error && body.error.code) || 'bad response')
    }

    const fmtSigned = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0')

    async function fetchExcerpt(book) {
      const res = await fetch('api/lifeboard/excerpt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ book }) })
      const body = await res.json()
      if (!res.ok || body?.ok !== true) throw new Error(body?.error?.code ?? ('HTTP ' + res.status))
      return body.value
    }

    function openSource(path) {
      fetch('api/lifeboard/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) }).catch(() => {})
    }

    function SrcLink({ t, path, children }) {
      return h('button', {
        className: 'lb-src',
        title: t('src.openTitle'),
        onClick: () => openSource(path),
      }, children)
    }

    // 封面缓存：书名 → data URL（仅内存，不落盘、不出远端）
    const coverUrls = new Map()
    async function loadCover(title) {
      if (coverUrls.has(title)) return coverUrls.get(title)
      try {
        const res = await fetch('api/lifeboard/cover', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ book: title }),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const body = await res.json()
        if (body?.ok !== true) throw new Error(body?.error?.code ?? 'bad')
        const url = `data:${body.value.mime};base64,${body.value.base64}`
        coverUrls.set(title, url)
        return url
      } catch {
        coverUrls.set(title, null)
        return null
      }
    }
    const hhmm = (date) => (date ? new Date(date).toTimeString().slice(0, 5) : '')

    /** 到期日期 → 人话标签（今天/明天/昨天/N 天后/N 天前） */
    function dueLabel(dateStr, t) {
      const [y, m, d] = dateStr.split('-').map(Number)
      const due = new Date(y, m - 1, d)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diff = Math.round((due - today) / 86400000)
      if (diff === 0) return t('date.today')
      if (diff === 1) return t('date.tomorrow')
      if (diff === -1) return t('date.yesterday')
      if (diff > 1) return t('date.inDays').replace('{n}', String(diff))
      return t('date.daysAgo').replace('{n}', String(-diff))
    }

    function CardHead({ icon, title, tag, dot }) {
      return h('div', { className: 'lb-card-head' },
        h('span', { className: 'lb-card-icon', 'aria-hidden': true }, icon),
        h('h3', { className: 'lb-card-title' }, title),
        dot ? h('span', { className: 'lb-dot', 'aria-hidden': true }) : null,
        tag ? h('span', { className: 'lb-card-tag' }, tag) : null,
      )
    }

    function Sparkline({ series }) {
      const pts = (Array.isArray(series) ? series : []).filter((d) => typeof d.weightKg === 'number')
      const [hover, setHover] = useState(null)
      if (pts.length < 2) return h('div', { className: 'lb-spark-empty', 'aria-hidden': true })
      const width = 200
      const height = 34
      const vals = pts.map((d) => d.weightKg)
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const span = max - min || 1
      const step = width / (pts.length - 1)
      const coords = vals.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 8)])
      const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
      const [lastX, lastY] = coords[coords.length - 1]
      // 悬停：按鼠标横向位置吸附到最近的一天（2026-11-10 leo 要「趋势图上的悬停数字」）
      const pick = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        setHover(Math.round(ratio * (pts.length - 1)))
      }
      const hot = hover === null ? null : coords[hover]
      return h('div', { className: 'lb-spark-wrap', onMouseMove: pick, onMouseLeave: () => setHover(null) },
        h('svg', { className: 'lb-spark', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': true },
          h('polygon', { points: `${points} ${width},${height} 0,${height}`, fill: 'currentColor', opacity: 0.12, stroke: 'none' }),
          h('polyline', { points, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })),
        hot ? h('i', { className: 'lb-spark-dot lb-spark-dot-hot', style: { left: ((hot[0] / width) * 100).toFixed(2) + '%', top: ((hot[1] / height) * 100).toFixed(2) + '%' } }) : null,
        h('i', { className: 'lb-spark-dot', style: { left: ((lastX / width) * 100).toFixed(2) + '%', top: ((lastY / height) * 100).toFixed(2) + '%' } }),
        hover !== null
          ? h('span', {
              className: 'lb-spark-tip',
              style: { left: ((coords[hover][0] / width) * 100).toFixed(2) + '%' },
            },
              h('em', { className: 'lb-spark-tip-d' }, pts[hover].date.slice(5)),
              h('b', { className: 'lb-spark-tip-v' }, pts[hover].weightKg + ' kg'))
          : null)
    }

    // ---------- 卡片 ----------
    function GoalRing({ goal }) {
      const r = 15
      const c = 2 * Math.PI * r
      return h('svg', { className: 'lb-ring', viewBox: '0 0 40 40', 'aria-hidden': true },
        h('circle', { cx: 20, cy: 20, r, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 4 }),
        h('circle', {
          cx: 20, cy: 20, r, fill: 'none', stroke: 'var(--lb-accent)', strokeWidth: 4, strokeLinecap: 'round',
          strokeDasharray: c.toFixed(1), strokeDashoffset: (c * (1 - goal.progress)).toFixed(1),
          transform: 'rotate(-90 20 20)',
        }),
        h('text', { x: 20, y: 24, 'text-anchor': 'middle', className: 'lb-ring-text' }, Math.round(goal.progress * 100) + '%'))
    }

    // 空状态分三档：缺文件 / 目录空 / 格式对不上 —— 比一句「数据缺席」有用（2026-11-10）
    const absentNote = (t, hint) => {
      if (!hint || !hint.code) return t('panel.dataAbsent')
      if (hint.code === 'no-file') return t('panel.noFile').replace('{path}', hint.path ?? '')
      if (hint.code === 'no-recent') return t('panel.noRecent')
      if (hint.code === 'format') return t('panel.format').replace('{detail}', hint.detail ?? '')
      return t('panel.dataAbsent')
    }

    // 格式体检：默认只占一行，点开才展开细节（2026-11-10 leo：原来太大，影响观感）
    function DiagnoseBar({ t, items }) {
      const [open, setOpen] = useState(false)
      return h('section', { className: 'lb-diagnose' },
        h('button', { className: 'lb-diag-bar', onClick: () => setOpen(!open), 'aria-expanded': open ? 'true' : 'false' },
          h('span', { className: 'lb-diag-mark', 'aria-hidden': true }, '!'),
          h('span', { className: 'lb-diag-text' }, t('panel.diagnose') + ' · ' + items.length),
          h('span', { className: 'lb-diag-toggle' }, open ? t('panel.collapse') : t('panel.expand'))),
        open
          ? h('div', { className: 'lb-diag-panel' },
              h('p', { className: 'lb-note' }, t('panel.diagnoseHint')),
              h('ul', { className: 'lb-diag-list' },
                items.map((d) => h('li', { key: d.code + d.file, className: 'lb-diag' },
                  h('span', { className: 'lb-diag-msg' }, d.message),
                  d.expect ? h('code', { className: 'lb-diag-expect' }, d.expect.replace(/\\n/g, ' ⏎ ')) : null))))
          : null)
    }

    function HealthCard({ t, health }) {
      if (!health || health.available !== true) {
        return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-success-primary,#12b76a)' } },
          h(CardHead, { icon: '🩺', title: t('health.title'), dot: false }),
          h('p', { className: 'lb-note' }, absentNote(t, health?.hint)),
          h(SrcLink, { t, path: '_assistant/life/log/' }, t('source.health').replace('{date}', 'YYYY-MM-DD')))
      }
      const delta = health.weightDelta
      const weights = Array.isArray(health.series) ? health.series.map((s) => s.weightKg) : []
      return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-success-primary,#12b76a)' } },
        h(CardHead, { icon: '🩺', title: t('health.title'), dot: true, tag: health.date }),
        h('p', { className: 'lb-metric' },
          h('span', { className: 'lb-big' }, health.weightKg ?? '—'),
          h('span', { className: 'lb-unit' }, 'kg'),
          delta !== null && delta !== undefined
            ? h('span', { className: 'lb-delta ' + (delta > 0 ? 'lb-delta-up' : delta < 0 ? 'lb-delta-down' : '') },
                // 箭头已经表示方向，数字再带负号会变成「▼ −0.3」双符号（2026-11-10 leo 反馈）
                (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + (delta === 0 ? '0' : String(Math.abs(delta))))
            : h('span', { className: 'lb-metric-sub' }, t('health.noCompare')),
        // 2026-11-10 leo：主位只放「较昨日」的变化（上面那个徽章），
        // 总进度交给右侧圆环；环旁边不再堆文字，干净一点。详情走 title 提示。
        health.goal
          ? h('span', {
              className: 'lb-goal',
              title: t('health.goalDetail')
                .replace('{lost}', health.goal.lost > 0 ? '−' + health.goal.lost : '+' + Math.abs(health.goal.lost))
                .replace('{goal}', health.goal.fatGoal)
                .replace('{pct}', Math.round((health.goal.progress || 0) * 100)),
            }, h(GoalRing, { goal: health.goal }))
          : null),
        h('div', null,
          h('span', { className: 'lb-spark-label' }, t('health.trend')),
          h(Sparkline, { series: health.series })),
        h('ul', { className: 'lb-stats lb-stats-6' },
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.bodyFat')), h('span', { className: 'lb-stat-v' }, health.vitals?.bodyFat ?? '—', h('small', null, '%'))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.visceralFat')), h('span', { className: 'lb-stat-v' }, health.vitals?.visceralFat ?? health.visceralFat ?? '—', h('small', null, '级'))),
          h('li', { className: 'lb-stat' + (health.vitals?.boneSaltWarn ? ' lb-stat-warn' : ''), title: health.vitals?.boneSaltWarn ? '骨盐率不足，需负重+钙/维D' : '' }, h('span', { className: 'lb-stat-k' }, t('health.boneSalt')), h('span', { className: 'lb-stat-v' }, health.vitals?.boneSalt ?? '—', h('small', null, '%'))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.heartRate')), h('span', { className: 'lb-stat-v' }, health.vitals?.heartRate ?? '—', h('small', null, 'bpm'))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.sleep')), h('span', { className: 'lb-stat-v' }, health.sleepAvgHours ?? '—', h('small', null, health.sleepAvgHours !== null && health.sleepDays > 0 ? 'h · ' + health.sleepDays + ' ' + t('health.sleepDaysSuffix') : 'h'))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.exercise')), h('span', { className: 'lb-stat-v' }, health.exerciseDays, h('small', null, t('health.exerciseSuffix'))))),
        health.protein && health.protein.loggedDays > 0
          ? (() => {
              const P = health.protein
              const today = P.today
              const todayGrams = today ? today.grams : null
              const ratio = todayGrams === null ? 0 : Math.min(1, todayGrams / P.target)
              const threshold = P.threshold ?? P.target
              const state = (d) => {
                if (d.grams === null) return ' lb-pdot-none'
                if (d.partial) return ' lb-pdot-partial'
                return d.grams >= threshold ? ' lb-pdot-hit' : ' lb-pdot-miss'
              }
              return h('div', { className: 'lb-protein', title: t('health.protein') },
                h('div', { className: 'lb-protein-head' },
                  h('span', { className: 'lb-stat-k' }, t('health.proteinToday')),
                  h('span', { className: 'lb-protein-avg' }, todayGrams ?? '—', h('small', null, 'g')),
                  h('span', { className: 'lb-dim' }, '/ ' + P.target + 'g'),
                  today && today.partial ? h('span', { className: 'lb-chip' }, t('health.proteinPartial')) : null),
                h('span', { className: 'lb-protein-bar', 'aria-hidden': true },
                  h('i', { style: { width: (ratio * 100).toFixed(1) + '%' }, className: todayGrams !== null && todayGrams >= threshold ? 'lb-protein-bar-hit' : '' })),
                h('div', { className: 'lb-protein-foot' },
                  h('span', { className: 'lb-protein-dots' },
                    P.week.map((d) => h('i', {
                      key: d.date,
                      className: 'lb-pdot' + state(d),
                      title: d.date.slice(5) + ' ' + (d.grams === null ? '未记录' : d.grams + 'g' + (d.partial ? '（' + t('health.proteinPartial') + '）' : '')),
                    }))),
                  h('span', { className: 'lb-dim lb-protein-hit', title: '≥' + threshold + 'g 算达标（目标 ' + P.target + 'g − ' + Math.round((1 - threshold / P.target) * 100) + '% 容差）' }, t('health.proteinHit').replace('{n}', String(P.hitDays)).replace('{m}', String(P.fullDays)))))
            })()
          : null,
        h(SrcLink, { t, path: health.src ?? '_assistant/life/log/' }, t('source.health').replace('{date}', health.date)))
    }

    function taskAction(payload) {
      return fetch('api/lifeboard/task', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        .then(async (res) => {
          const body = await res.json()
          if (!res.ok || body?.ok !== true) throw new Error(body?.error?.message ?? body?.error?.code ?? ('HTTP ' + res.status))
          return body.value
        })
    }

    function TasksCard({ t, tasks, onChanged }) {
      if (!tasks || tasks.available !== true) {
        return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#7a5af8)' } },
          h(CardHead, { icon: '✅', title: t('tasks.title'), dot: false }),
          h('p', { className: 'lb-note' }, absentNote(t, tasks?.hint)),
          h(SrcLink, { t, path: '_assistant/TODO.md' }, t('source.tasks')))
      }
      const items = Array.isArray(tasks.items) ? tasks.items : []
      const groups = [
        { key: 'work', title: t('tasks.work'), list: items.filter((i) => i.group === 'work') },
        { key: 'life', title: t('tasks.life'), list: items.filter((i) => i.group !== 'work') },
      ]
      const row = (item, index) => h('li', { key: index, className: 'lb-row lb-task-row' },
        h('span', { className: 'lb-chip' + (item.overdue ? ' lb-chip-warn' : '') }, dueLabel(item.date, t)),
        h('span', { className: 'lb-task', title: item.title }, item.title),
        h('span', { className: 'lb-row-actions' },
          h('button', {
            className: 'lb-act', title: t('tasks.postpone'),
            onClick: () => taskAction({ action: 'postpone', line: item.raw, days: 1 }).then(onChanged).catch((e) => alert(t('tasks.actionFail') + '：' + e.message)),
          }, '⏩'),
          h('button', {
            className: 'lb-act lb-act-done', title: t('tasks.done'),
            onClick: () => { if (typeof confirm === 'function' ? confirm(t('tasks.doneConfirm')) : true) taskAction({ action: 'done', line: item.raw }).then(onChanged).catch((e) => alert(t('tasks.actionFail') + '：' + e.message)) },
          }, '✓')))
      return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#7a5af8)' } },
        h(CardHead, { icon: '✅', title: t('tasks.title'), dot: true }),
        h('p', { className: 'lb-metric' },
          h('span', { className: 'lb-big' }, tasks.openCount),
          h('span', { className: 'lb-unit' }, t('tasks.unitItems')),
          tasks.overdueCount > 0 ? h('span', { className: 'lb-delta lb-delta-up' }, t('tasks.overdueCount').replace('{n}', String(tasks.overdueCount))) : null,
          tasks.undatedCount > 0 ? h('span', { className: 'lb-metric-sub' }, tasks.undatedCount + ' ' + t('tasks.undatedSuffix')) : null),
        h('div', { className: 'lb-groups' },
          groups.map((g) => g.list.length === 0 ? null : h('div', { key: g.key, className: 'lb-group' },
            h('div', { className: 'lb-group-head' }, g.title, h('span', { className: 'lb-group-n' }, g.list.length)),
            h('ul', { className: 'lb-rows' }, g.list.map(row))))),
        items.length === 0 ? h('p', { className: 'lb-note' }, t('tasks.noDated')) : null,
        tasks.moreCount > 0 ? h('p', { className: 'lb-note lb-dim' }, t('tasks.more').replace('{n}', String(tasks.moreCount))) : null,
        h(SrcLink, { t, path: tasks.src ?? '_assistant/TODO.md' }, t('source.tasks')))
    }

    function AssetCard({ t, finance }) {
      const A = finance.assets
      const groups = Array.isArray(A.groups) ? A.groups : []
      const top = Array.isArray(A.top) ? A.top : []
      const spend = finance.available === true ? finance : null
      return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-success-primary,#12b76a)' } },
        h(CardHead, { icon: '💼', title: t('assets.title'), dot: true, tag: t('assets.asOf') + ' ' + String(A.asOf).slice(5) }),
        h('div', { className: 'lb-asset-row' },
          h('svg', { className: 'lb-donut', viewBox: '0 0 120 120', width: '112', height: '112', role: 'img', 'aria-label': t('assets.title') },
            (() => {
              const R = 46
              const C = 2 * Math.PI * R
              let acc = 0
              const colors = ['#6172f3', '#12b76a', '#f79009', '#f04438', '#14b8a6', '#a855f7']
              return groups.map((g, i) => {
                const len = Math.max(0, (C * Number(g.pct || 0)) / 100)
                const seg = h('circle', {
                  key: g.group,
                  cx: 60, cy: 60, r: R, fill: 'none',
                  stroke: colors[i % colors.length],
                  strokeWidth: 16,
                  strokeDasharray: len + ' ' + (C - len),
                  strokeDashoffset: -acc,
                  transform: 'rotate(-90 60 60)',
                  strokeLinecap: 'butt',
                })
                acc += len
                return seg
              })
            })(),
            h('text', { x: 60, y: 56, textAnchor: 'middle', className: 'lb-donut-num' }, Number(A.total).toFixed(1)),
            h('text', { x: 60, y: 74, textAnchor: 'middle', className: 'lb-donut-unit' }, t('assets.unitWan'))),
          h('ul', { className: 'lb-asset-legend' },
            groups.map((g, i) => h('li', { key: g.group, className: 'lb-legend-row' },
              h('i', { className: 'lb-legend-dot', style: { background: ['#6172f3', '#12b76a', '#f79009', '#f04438', '#14b8a6', '#a855f7'][i % 6] } }),
              h('span', { className: 'lb-legend-name' }, g.group),
              h('span', { className: 'lb-legend-val' }, g.pct + '%'),
              h('span', { className: 'lb-legend-amt' }, g.amount.toFixed(1) + t('assets.unitWan')))))),
        h('ul', { className: 'lb-stats' },
          top.map((x) => h('li', { key: x.name, className: 'lb-stat', title: x.name + ' · ' + x.amount.toFixed(1) + t('assets.unitWan') },
            h('span', { className: 'lb-stat-k' }, x.name),
            h('span', { className: 'lb-stat-v' }, x.amount.toFixed(1), h('small', null, t('assets.unitWan') + ' · ' + x.pct + '%'))))),
        spend
          ? h('p', { className: 'lb-note' }, t('finance.month') + ' ¥' + spend.monthSpend.toLocaleString() + ' · ' + t('finance.eatOut') + ' ' + spend.eatOutCount + t('finance.unitTimes'))
          : null,
        h(SrcLink, { t, path: A.src ?? '_assistant/life/private/资产快照.tsv' }, t('source.finance')))
    }

    function FinanceCard({ t, finance }) {
      // 财务默认不出宿主；未请求时 finance 为 null，整张卡不渲染
      if (finance === null || finance === undefined) return null
      // 2026-11-09：财务板块改为「资产总览」；资产快照缺失时退回原支出视图
      if (finance.assets && finance.assets.available === true) return h(AssetCard, { t, finance })
      if (finance.available !== true) {
        return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-warning-primary,#f79009)' } },
          h(CardHead, { icon: '💰', title: t('finance.title'), dot: false }),
          h('p', { className: 'lb-note' }, absentNote(t, finance?.hint)),
          h(SrcLink, { t, path: '_assistant/life/private/消费流水.tsv' }, t('source.finance')))
      }
      const latest = finance.latest
      return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-warning-primary,#f79009)' } },
        h(CardHead, { icon: '💰', title: t('finance.title'), dot: true, tag: finance.month }),
        h('p', { className: 'lb-metric' },
          h('span', { className: 'lb-big' }, '¥' + finance.monthSpend.toLocaleString()),
          finance.monthInvest > 0 ? h('span', { className: 'lb-metric-sub' }, t('finance.invest') + ' ¥' + finance.monthInvest.toLocaleString()) : null),
        h('ul', { className: 'lb-stats' },
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('finance.eatOut')), h('span', { className: 'lb-stat-v' }, finance.eatOutCount, h('small', null, t('finance.unitTimes')))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('finance.latest')), h('span', { className: 'lb-stat-v' }, latest ? latest.date.slice(5) : '—', h('small', null, latest ? ' ' + latest.category : ''))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('finance.investTotal')), h('span', { className: 'lb-stat-v' }, '¥' + finance.investTotal.toLocaleString(), h('small', null, finance.investCount + '笔' + (finance.lastInvestDate ? ' · ' + finance.lastInvestDate.slice(5) : ''))))),
        h(SrcLink, { t, path: finance.src ?? '_assistant/life/private/消费流水.tsv' }, t('source.finance')))
    }

    function CoverImg({ title }) {
      const [src, setSrc] = useState(coverUrls.get(title) ?? null)
      const [failed, setFailed] = useState(coverUrls.has(title) && coverUrls.get(title) === null)
      useEffect(() => {
        let alive = true
        if (src === null && !failed) {
          loadCover(title).then((url) => { if (alive) { if (url) setSrc(url); else setFailed(true) } })
        }
        return () => { alive = false }
      }, [title])
      if (failed || src === null) {
        return h('span', { className: 'lb-cover lb-cover-fallback' }, title.slice(0, 4))
      }
      return h('img', { className: 'lb-cover', src, alt: title, loading: 'lazy', draggable: false })
    }

    const MOOD_CHOICES = [['😄', '饱满'], ['🙂', '正常'], ['😐', '一般'], ['😮‍💨', '低迷']]

    function MoodCard({ t, health, onChanged }) {
      const [checking, setChecking] = useState(false)
      const checkin = (mood) => {
        setChecking(true)
        fetch('api/lifeboard/mood', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mood }) })
          .catch(() => {})
          .finally(() => { setChecking(false); if (onChanged) onChanged() })
      }
      const absent = !health || health.available !== true
      const M = absent ? null : health.mood
      const days = absent ? 0 : (M ? M.loggedDays : health.moodDays)
      const mood = absent ? null : (M ? M.latest : health.moodLatest)
      const streak = absent || !M ? 0 : M.streak
      const dots = !absent && M ? M.days : []
      const ex = absent ? 0 : health.exerciseDays
      const km = absent ? 0 : health.weekKm
      return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#14b8a6)' } },
        h(CardHead, { icon: '🧠', title: t('mood.title'), dot: !absent }),
        h('p', { className: 'lb-metric' },
          h('span', { className: 'lb-big' }, days),
          h('span', { className: 'lb-unit' }, '/ 7'),
          h('span', { className: 'lb-metric-sub' }, t('mood.week')),
          streak > 0 ? h('span', { className: 'lb-delta lb-delta-down' }, t('mood.streak').replace('{n}', String(streak))) : null),
        dots.length > 0
          ? h('div', { className: 'lb-mood-dots' }, dots.map((d) => h('i', { key: d.date, className: 'lb-mdot' + (d.logged ? ' lb-mdot-on' : ''), title: d.date.slice(5) })))
          : null,
        h('ul', { className: 'lb-stats' },
          h('li', { className: 'lb-stat', title: mood ?? '' }, h('span', { className: 'lb-stat-k' }, t('mood.latest')), h('span', { className: 'lb-stat-v' }, mood ?? '—')),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('health.exercise')), h('span', { className: 'lb-stat-v' }, ex, h('small', null, t('health.exerciseSuffix')))),
          h('li', { className: 'lb-stat' }, h('span', { className: 'lb-stat-k' }, t('mood.km')), h('span', { className: 'lb-stat-v' }, km > 0 ? km : '—', h('small', null, km > 0 ? t('mood.kmUnit') : '')))),
        h('div', { className: 'lb-checkin' },
          h('span', { className: 'lb-stat-k' }, t('mood.checkin')),
          MOOD_CHOICES.map(([emoji, m]) => h('button', { key: m, className: 'lb-checkin-btn', disabled: checking, onClick: () => checkin(m) }, emoji + ' ' + m))),
        h(SrcLink, { t, path: absent ? '_assistant/life/log/' : health.src }, t('source.health').replace('{date}', absent ? '…' : health.date)))
    }

    function ShelfCard({ t, shelf }) {
      if (!shelf || shelf.available !== true) {
        return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#6172f3)' } },
          h(CardHead, { icon: '📚', title: t('shelf.title'), dot: false }),
          h('p', { className: 'lb-note' }, absentNote(t, shelf?.hint)),
          h(SrcLink, { t, path: '_assistant/notes/书架/' }, t('source.shelf')))
      }
      const [excerpt, setExcerpt] = useState(null)
      const [excerptLoading, setExcerptLoading] = useState(false)
      const loadExcerpt = (book) => {
        setExcerptLoading(true)
        fetchExcerpt(book)
          .then((v) => setExcerpt(v))
          .catch(() => setExcerpt(null))
          .finally(() => setExcerptLoading(false))
      }
      const books = Array.isArray(shelf.books) ? shelf.books : []
      const head = h(CardHead, {
        icon: '📚',
        title: t('shelf.title'),
        dot: true,
        tag: shelf.count + ' ' + t('shelf.unitBooks') + ' · ' + t('shelf.original') + ' ' + shelf.originalCount,
      })
      if (books.length === 0) {
        return h('section', { className: 'lb-card', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#6172f3)' } }, head,
          h('p', { className: 'lb-note' }, absentNote(t, shelf?.hint)),
          h(SrcLink, { t, path: '_assistant/notes/书架/' }, t('source.shelf')))
      }
      return h('section', { className: 'lb-card lb-card-wide', style: { '--lb-accent': 'var(--dsw-alias-state-business-primary,#6172f3)' } }, head,
        h('ul', { className: 'lb-shelf' },
          books.map((b, i) => h('li', {
            key: i, className: 'lb-book' + (excerpt?.book === b.title ? ' lb-book-on' : ''),
            title: (b.author ? b.author + ' · ' : '') + (b.category ?? '') + ' —— 点击摘一段',
            onClick: () => loadExcerpt(b.title),
          },
            b.cover ? h(CoverImg, { title: b.title }) : h('span', { className: 'lb-cover lb-cover-fallback' }, b.title.slice(0, 4)),
            h('span', { className: 'lb-book-name' }, b.title))))
        ,
        excerpt
          ? h('blockquote', { className: 'lb-quote' },
              h('div', { className: 'lb-quote-head' },
                h('span', { className: 'lb-chip' }, excerpt.kind),
                h('span', { className: 'lb-quote-src' }, '《' + excerpt.book + '》 · ' + excerpt.source),
                h('span', { className: 'lb-quote-actions' },
                  h('button', { className: 'lb-act', onClick: () => loadExcerpt(excerpt.book), disabled: excerptLoading }, excerptLoading ? t('shelf.loading') : t('shelf.excerpt')),
                  h('button', { className: 'lb-act', onClick: () => setExcerpt(null) }, t('shelf.close')))),
              h('p', { className: 'lb-quote-text' }, excerpt.text))
          : excerptLoading
            ? h('p', { className: 'lb-note' }, t('shelf.loading'))
            : null,
        h(SrcLink, { t, path: shelf.src ?? '_assistant/notes/书架/' }, t('source.shelf')))
    }

    // ---------- 主面板 ----------
    function LifeBoardPanel(props) {
      const t = props.t
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(false)
      const [showFinance, setShowFinance] = useState(() => {
        try { return typeof localStorage !== 'undefined' && localStorage.getItem('lifeboard.finance') === '1' } catch { return false }
      })

      const reload = useCallback(() => {
        let alive = true
        setLoading(true)
        fetchBoard(showFinance ? ['finance'] : [])
          .then((v) => { if (alive) { setData(v); setError(null) } })
          .catch((e) => { if (alive) setError(String(e && e.message ? e.message : e)) })
          .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
      }, [showFinance])

      useEffect(() => reload(), [reload])

      // 刷新机制：面板可见时每 60s 轻量刷新（宿主按 mtime 缓存，未变更文件不重读）
      useEffect(() => {
        const id = setInterval(() => {
          if (typeof document === 'undefined' || document.hidden !== true) reload()
        }, 60_000)
        return () => clearInterval(id)
      }, [reload])

      const updated = data && data.generatedAt ? hhmm(data.generatedAt) : ''
      // 卡片开关：宿主配置决定显示哪几张（2026-11-09 上架改造）
      const cards = Object.assign({ health: true, tasks: true, assets: true, mood: true, shelf: true }, (data && data.cards) || {})
      return h('div', { className: 'lb-root' },
        h('div', { className: 'lb-wrap' },
          h('div', { className: 'lb-head' },
            h('div', { className: 'lb-head-main' },
              h('div', { className: 'lb-eyebrow' }, t('panel.eyebrow')),
              h('h2', { className: 'lb-title' }, t('panel.title')),
              h('span', { className: 'lb-sub' }, t('panel.subtitle'))),
            h('div', { className: 'lb-head-right' },
              updated ? h('span', { className: 'lb-updated' }, t('panel.updated').replace('{t}', updated)) : null,
              h('button', {
                className: 'lb-toggle' + (showFinance ? ' lb-toggle-on' : ''),
                title: t('finance.toggleHint'),
                'aria-pressed': showFinance ? 'true' : 'false',
                onClick: () => {
                  const next = !showFinance
                  setShowFinance(next)
                  try { localStorage.setItem('lifeboard.finance', next ? '1' : '0') } catch { /* ignore */ }
                },
              }, showFinance ? t('finance.hide') : t('finance.show')),
              h('button', { className: 'lb-refresh', onClick: reload, disabled: loading }, loading ? t('panel.refreshing') : t('panel.refresh')))),
          error !== null ? h('p', { className: 'lb-note lb-warn' }, t('panel.loadFailed') + '：' + error) : null,
          data && data.vaultMissing === true ? h('p', { className: 'lb-note lb-warn' }, t('panel.vaultMissing')) : null,
          data && data.demo === true ? h('p', { className: 'lb-note lb-warn' }, '示例数据 · 到「设置 → ' + t('panel.title') + '」关掉预览并填自己的路径') : null,

          (Array.isArray(data?.diagnostics) && data.diagnostics.length > 0)
            ? h(DiagnoseBar, { t, items: data.diagnostics })
            : null,
          h('div', { className: 'lb-grid' },
            (cards.health ? h(HealthCard, { t, health: data ? data.health : null }) : null),
            (cards.tasks ? h(TasksCard, { t, tasks: data ? data.tasks : null, onChanged: reload }) : null),
            (cards.shelf ? h(ShelfCard, { t, shelf: data ? data.shelf : null }) : null),
            (cards.mood ? h(MoodCard, { t, health: data ? data.health : null, onChanged: reload }) : null),
            (cards.assets ? h(FinanceCard, { t, finance: data ? data.finance : null }) : null))))
    }

    function insertStyles(css) {
      // 优先用内置 styles；不可用时退到 style 元素（与 dsh-context 相同手法），
      // 保证任何环境下都不至于让 web boot 失败。
      try {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          return styles.insert(css)
        }
      } catch { /* fall through */ }
      if (typeof document === 'undefined') return () => {}
      const el = document.createElement('style')
      el.dataset.plugin = NS
      el.textContent = css
      document.head.appendChild(el)
      return () => el.remove()
    }


    // ---------- 设置页（2026-11-09 上架：让用户自己选数据源） ----------
    const SETTINGS_FIELDS = [
      ['vaultRoot', 'vaultRoot', '资料目录（留空＝自动探测；就是放笔记的那个文件夹）'],
      ['logDir', 'logDir', '每日日志目录'],
      ['todoFile', 'todoFile', '待办文件'],
      ['assetsFile', 'assetsFile', '资产快照（TSV）'],
      ['financeFile', 'financeFile', '消费流水（TSV）'],
      ['shelfDir', 'shelfDir', '书架目录'],
      ['coverDir', 'coverDir', '书封目录'],
      ['excerptDir', 'excerptDir', '书摘目录'],
    ]

    function LifeboardSettings({ t }) {
      const [form, setForm] = useState(null)
      const [msg, setMsg] = useState('')
      const [saving, setSaving] = useState(false)
      const [probing, setProbing] = useState(false)
      const [probe, setProbe] = useState(null)
      const [scanning, setScanning] = useState(false)
      const [scan, setScan] = useState(null)

      const load = useCallback(() => {
        fetch('api/lifeboard/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"get"}' })
          .then((r) => r.json())
          .then((v) => { if (v && v.ok) setForm(v.value) })
          .catch(() => setMsg('读取失败'))
      }, [])
      useEffect(() => { load() }, [load])

      const set = (key, value) => setForm((f) => Object.assign({}, f, { [key]: value }))
      const setCard = (key, value) => setForm((f) => Object.assign({}, f, { cards: Object.assign({}, f.cards, { [key]: value }) }))

      // 自动扫描：在 vault 里找候选数据源，用户点「用这个」写进表单（2026-11-10 M2.5）
      const runScan = () => {
        setScanning(true)
        setScan(null)
        fetch('api/lifeboard/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          .then((r) => r.json())
          .then((v) => setScan(v && v.ok ? v.value : { candidates: [], error: (v && v.error && v.error.message) || '扫描失败' }))
          .catch(() => setScan({ candidates: [], error: '扫描失败' }))
          .finally(() => setScanning(false))
      }

      // 按当前表单值检查一遍路径，不用先保存（2026-11-10 易用性）
      const runProbe = () => {
        setProbing(true)
        setProbe(null)
        fetch('api/lifeboard/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: form }) })
          .then((r) => r.json())
          .then((v) => setProbe(v && v.ok ? v.value : { items: [], error: (v && v.error && v.error.message) || '检查失败' }))
          .catch(() => setProbe({ items: [], error: '检查失败' }))
          .finally(() => setProbing(false))
      }

      const save = () => {
        setSaving(true)
        setMsg('')
        fetch('api/lifeboard/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', values: form }) })
          .then((r) => r.json())
          .then((v) => setMsg(v && v.ok ? '已保存，刷新看板生效' : '保存失败'))
          .catch(() => setMsg('保存失败'))
          .finally(() => setSaving(false))
      }

      if (form === null) return h('p', { className: 'lb-note' }, msg || '读取中…')
      const cards = Object.assign({ health: true, tasks: true, assets: true, mood: true, shelf: true }, form.cards || {})
      // 格式示例：给不想读 README 的人一份可复制的模板（2026-11-10）
      const TEMPLATES = [
        ['每日日志', '_assistant/life/log/YYYY-MM-DD.md', `## 健康

| 指标 | 数值 |
|:--|:--|
| 体重 | **69.5 kg** |
| 体脂率 | **22.1%** |
| 内脏脂肪 | **9 级** |
| 骨盐率 | **4.0%** |
| 心率 | **68** |

## 睡眠

- 睡了 7.5 小时

## 情绪

- **正常**

## 运动

- 慢跑 5.2 km

## 饮食

- 今日累计（日终）：蛋白 **~130g** · 热量 **~2100 kcal**`],
        ['待办', '_assistant/TODO.md', `- [ ] 整理季度复盘 | 截止：2026-11-20 | #工作
- [x] 续费服务器 | 完成：2026-11-09`],
        ['资产', '_assistant/life/private/资产快照.tsv', `日期\t类别\t名称\t金额万
2026-11-10\t基金\t全球股票指数\t32.0
2026-11-10\t现金\t货币基金\t8.0`],
        ['书架', '_assistant/notes/书架/书名.md', `# 系统之美

> 作者：德内拉·梅多斯 · 分类：思维类 · 级别：原文级 · 加入：2026-10-20

## 核心框架
- 系统的三个要件：要素、连接、目标。`],
      ]
      const CARD_LABELS = { health: '健康', tasks: '任务', assets: '资产', mood: '情绪·运动', shelf: '书架' }
      return h('div', { className: 'lb-settings' },
        // 自动扫描放最上面：新用户第一步就该是「让它自己找」（2026-11-10 M2.5）
        h('div', { className: 'lb-scan' },
          h('div', { className: 'lb-field-row' },
            h('button', { className: 'lb-refresh lb-scan-btn', onClick: runScan, disabled: scanning },
              scanning ? t('settings.scanning') : t('settings.scan')),
            h('span', { className: 'lb-note' }, t('settings.scanHint'))),
          scan
            ? h('div', { className: 'lb-probe' },
                scan.error ? h('p', { className: 'lb-warn' }, scan.error) : null,
                (scan.candidates ?? []).length === 0
                  ? h('p', { className: 'lb-note' }, t('settings.scanEmpty'))
                  : h('div', null,
                      (scan.candidates ?? []).map((c) => h('div', { key: c.key + c.path, className: 'lb-scan-row' },
                        h('span', { className: 'lb-probe-dot lb-probe-ok', 'aria-hidden': true }),
                        h('b', { className: 'lb-scan-key' }, c.key),
                        h('code', { className: 'lb-probe-path' }, c.path),
                        h('span', { className: 'lb-probe-detail' }, c.detail),
                        h('button', { className: 'lb-act', onClick: () => set(c.key, c.path) }, t('settings.useThis')))),
                      h('button', {
                        className: 'lb-refresh lb-scan-all',
                        onClick: () => {
                          const best = {}
                          for (const c of scan.candidates ?? []) {
                            if (best[c.key] === undefined || c.score > (best[c.key].score ?? 0)) best[c.key] = c
                          }
                          setForm((f) => Object.assign({}, f, Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.path]))))
                        },
                      }, t('settings.useAll'))))
            : null),
        h('p', { className: 'lb-note' }, '所有路径都相对上面的资料目录；文件不存在时对应卡片自动显示「暂无数据」。'),
        h('details', { className: 'lb-tpl' },
          h('summary', null, t('settings.advanced')),
          h('p', { className: 'lb-note' }, t('settings.advancedHint')),
          SETTINGS_FIELDS.map(([key, , label]) => h('label', { key, className: 'lb-field' },
            h('span', { className: 'lb-field-k' }, label),
            h('input', { className: 'lb-input', value: form[key] ?? '', onChange: (e) => set(key, e.target.value) })))),
        h('div', { className: 'lb-field-row' },
          h('label', { className: 'lb-field' },
            h('span', { className: 'lb-field-k' }, '统计窗口（天）'),
            h('input', { className: 'lb-input', type: 'number', value: form.windowDays ?? 7, onChange: (e) => set('windowDays', Number(e.target.value)) })),
          h('label', { className: 'lb-field' },
            h('span', { className: 'lb-field-k' }, '蛋白目标（g/天）'),
            h('input', { className: 'lb-input', type: 'number', value: form.proteinTarget ?? 130, onChange: (e) => set('proteinTarget', Number(e.target.value)) }))),
        h('div', { className: 'lb-cards' },
          Object.keys(CARD_LABELS).map((key) => h('label', { key, className: 'lb-check' },
            h('input', { type: 'checkbox', checked: cards[key] !== false, onChange: (e) => setCard(key, e.target.checked) }),
            h('span', null, CARD_LABELS[key])))),
        h('label', { className: 'lb-field' },
          h('span', { className: 'lb-field-k' }, t('settings.aliasTitle')),
          h('textarea', {
            className: 'lb-input lb-textarea',
            rows: 4,
            value: form.fieldAliasText ?? '',
            placeholder: t('settings.aliasPlaceholder'),
            onChange: (e) => set('fieldAliasText', e.target.value),
          }),
          h('span', { className: 'lb-note' }, t('settings.aliasHint'))),
        h('div', { className: 'lb-field-row lb-probe-row' },
          h('button', { className: 'lb-refresh', onClick: runProbe, disabled: probing || form === null },
            probing ? t('settings.probing') : t('settings.probe')),
          h('span', { className: 'lb-note' }, t('settings.probeHint'))),
        probe
          ? h('div', { className: 'lb-probe' },
              probe.error ? h('p', { className: 'lb-warn' }, probe.error) : null,
              (probe.items ?? []).map((it) => h('div', { key: it.key, className: 'lb-probe-row-item' },
                h('span', { className: 'lb-probe-dot lb-probe-' + it.status, 'aria-hidden': true }),
                h('code', { className: 'lb-probe-path' }, it.path),
                h('span', { className: 'lb-probe-detail' }, it.detail))))
          : null,
        h('details', { className: 'lb-tpl' },
          h('summary', null, t('panel.templateTitle')),
          h('p', { className: 'lb-note' }, t('panel.templateHint')),
          TEMPLATES.map(([name, file, body]) => h('div', { key: name, className: 'lb-tpl-item' },
            h('div', { className: 'lb-tpl-head' },
              h('b', null, name),
              h('code', { className: 'lb-tpl-file' }, file),
              h('button', {
                className: 'lb-refresh lb-tpl-copy',
                onClick: () => {
                  try { navigator.clipboard.writeText(body) } catch { /* 剪贴板不可用就手动选 */ }
                },
              }, t('panel.copyTemplate'))),
            h('pre', { className: 'lb-tpl-body' }, body)))),
        h('label', { className: 'lb-check' },
          h('input', { type: 'checkbox', checked: form.demoMode === true, onChange: (e) => set('demoMode', e.target.checked) }),
          h('span', null, '示例数据预览（虚构人物，先看效果再配自己的路径）')),
        h('label', { className: 'lb-field' },
          h('span', { className: 'lb-field-k' }, '示例封面目录（可选，只有你本机有图时才会用）'),
          h('input', { className: 'lb-input', value: form.demoCoverDir ?? '', onChange: (e) => set('demoCoverDir', e.target.value) })),
        h('div', { className: 'lb-field-row' },
          h('label', { className: 'lb-check' },
            h('input', { type: 'checkbox', checked: form.einkEnable === true, onChange: (e) => set('einkEnable', e.target.checked) }),
            h('span', null, 'Kindle 只读任务页（局域网 8788）')),
          h('label', { className: 'lb-field' },
            h('span', { className: 'lb-field-k' }, 'Kindle 挂载点'),
            h('input', { className: 'lb-input', value: form.einkKindleDir ?? '', onChange: (e) => set('einkKindleDir', e.target.value) }))),
        h('div', { className: 'lb-field-row' },
          h('button', { className: 'lb-refresh', onClick: save, disabled: saving }, saving ? '保存中…' : '保存'),
          h('button', { className: 'lb-refresh', onClick: load }, '重新读取'),
          msg ? h('span', { className: 'lb-note' }, msg) : null))
    }

    return {
      name: 'dsh-lifeboard',
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NS, DICTS), 'lifeboard: locale')
          const t = ctx.locale.bind(NS)

          ctx.effect(() => insertStyles(CSS), 'lifeboard: styles')

          // 设置 → 人生看板：让用户自己选数据源（2026-11-09 上架要求）
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'lifeboard-settings',
            order: 19,
            label: () => t('panel.title'),
            locale: NS,
            inject: () => ({ t }),
          }, LifeboardSettings))

          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_KEY,
            order: 15,
            label: () => t('panel.title'),
            locale: NS,
          }, BoardIcon))

          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_KEY,
            locale: NS,
          }, (props) => h(LifeBoardPanel, { ...props, t })))
        } catch (error) {
          // 硬约束「不破坏现有 GUI」：任何激活异常只降级为控制台错误，不拖垮 web boot
          console.error('lifeboard: client activation failed', error)
        }
      },
    }
  },
})
