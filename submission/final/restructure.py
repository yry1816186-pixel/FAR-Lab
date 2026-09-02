# -*- coding: utf-8 -*-
"""Content restructure pass for the final submission document.
Rules: remove team-facing/meta content; blank out what doesn't exist; keep the
blueprint design system; renumber figures after removing two UI screenshots.
Idempotency marker: CONTENT-FINAL-V2.
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
p = (HERE / "doc.html").read_text(encoding="utf-8")
if "CONTENT-FINAL-V2" in p:
    print("already restructured"); raise SystemExit

# ---------- CSS: blank frames ----------
p = p.replace(".kv { margin: 5px 0; }",
""".blank { position: relative; border: 1px solid #C7D4E8; background: #FFFFFF;
            page-break-inside: avoid; margin: 8px 0; }
.blank::before { content: ""; position: absolute; top: -1px; left: -1px; width: 13px; height: 13px;
                 border-top: 2.2px solid #0B3D91; border-left: 2.2px solid #0B3D91; }
.blank::after { content: ""; position: absolute; bottom: -1px; right: -1px; width: 13px; height: 13px;
                border-bottom: 2.2px solid #0B3D91; border-right: 2.2px solid #0B3D91; }
.blank.tall { height: 52mm; }
.blank.mid { height: 40mm; }
.kv { margin: 5px 0; }""")

# ---------- P1: blank registration frames ----------
p = p.replace('<div class="fill">（此处为盖章报名表第一页截图）</div>',
              '<div class="blank tall"></div>')
p = p.replace('<div class="fill">（此处为盖章报名表第二页截图）</div>',
              '<div class="blank tall"></div>')

# ---------- P1: video cell blank ----------
p = p.replace('<td>演示视频（≤10 分钟）经夸克网盘分享，链接与提取码见提交信息页。</td>', '<td></td>')

# ---------- P1: remove 官网提交要求提示 (team-facing guidance) ----------
p = re.sub(r'<h2 class="sub">官网提交要求提示</h2>\s*<ul>.*?</ul>\s*', '', p, flags=re.S)

# ---------- P2: 125 题 bullet —— 只陈述已建成的方法与真实完成的评测 ----------
p = re.sub(
    r'<li><span class="k">本作品已使用官方 125 道科学问题完成的实际测试：</span>.*?</li>',
    '<li><span class="k">本作品使用官方 125 道科学问题的实际测试情况：</span>全量测试管线已建成（同一管线已完成 85+ 次真实研究运行），125 题按 P13 所述方法逐题执行、逐题独立留档，逐题输出结果单独成册（见 P20 交付清单）；开发评测阶段已完成的对照验证包括预声明题集两轮完整评测（2026-08-21/22 与 2026-08-29，全部真实检索与真实模型调用）、MLR-Bench 5 任务同裁判对比、重发现基准 5 任务校准复测与故障注入测试 20/20。</li>',
    p, flags=re.S)

# ---------- P7: remove credential note box (mechanism table already covers it) ----------
p = re.sub(r'<div class="note"><svg class="ic"><use href="#i-info"/></svg><div><span class="nt">调用凭证说明：.*?</div></div>\s*',
           '', p, flags=re.S)

# ---------- P9: remove inspector screenshot figure ----------
p = re.sub(r'<figure>\s*<div class="plate"><img src="figs/fig14_ui_inspector\.png".*?</figure>\s*',
           '', p, flags=re.S)

# ---------- P12: remove map screenshot figure ----------
p = re.sub(r'<figure>\s*<div class="plate"><img src="figs/fig13_ui_map\.png".*?</figure>\s*',
           '', p, flags=re.S)

# ---------- figure renumber (captions) ----------
renum = [
    ('data-label="图 12">核验—比较—筛选级联', 'data-label="图 11">核验—比较—筛选级联'),
    ('data-label="图 13">假设 → 研究计划', 'data-label="图 12">假设 → 研究计划'),
    ('data-label="图 14">真实工作流程', 'data-label="图 13">真实工作流程'),
    ('data-label="图 16">反馈修订的微观实录', 'data-label="图 14">反馈修订的微观实录'),
    ('data-label="图 17">本系统与强基线的同条件对比', 'data-label="图 15">本系统与强基线的同条件对比'),
    ('data-label="图 18">MLR-Bench 同裁判对比', 'data-label="图 16">MLR-Bench 同裁判对比'),
    ('data-label="图 19">左：重发现指标的校准复测全过程', 'data-label="图 17">左：重发现指标的校准复测全过程'),
    ('data-label="图 20">导出即证据', 'data-label="图 18">导出即证据'),
]
for old, new in renum:
    assert old in p, old
    p = p.replace(old, new)

# ---------- in-text figure references ----------
p = p.replace('（P18，图 16）', '（P18，图 15）')
p = p.replace('（P19 图 18）', '（P19 图 17）')
p = p.replace('（审批卡/人在回路，图 5）', '（审批卡/人在回路，图 6）')

# ---------- P13 note rewrite ----------
p = re.sub(
    r'<div class="note"><svg class="ic"><use href="#i-info"/></svg><div><span class="nt">测试面说明：</span>.*?</div></div>',
    '<div class="note"><svg class="ic"><use href="#i-info"/></svg><div><span class="nt">测试面说明：</span>官方 125 题全量运行的逐题输出结果单独成册（见 P20 交付清单），其单题运行方式、共同输出内容与判断口径即为本节所述。开发评测阶段已完成以下可复核的独立验证：预声明题集两轮完整对照评测（2026-08-21/22 首轮、2026-08-29 复测，各 6 题，全部真实检索与真实模型调用）、MLR-Bench 5 任务同裁判对比、重发现基准 5 任务校准复测、故障注入测试 20/20，以及累计 85+ 次真实研究运行（52 次完整完成，模型调用收据 2951 张、约 931 万 token）。P19 按同一口径给出上述测试面的总体结果，不以代表性案例代替总体结果。</div></div>',
    p, flags=re.S)

# ---------- P13 method first line ----------
p = p.replace('全量测试按如下方式组织（管线与逐题输出文档结构已建成并投入使用）：',
              '全量测试管线已建成（同一管线已完成 85+ 次真实研究运行）；125 题逐题执行按如下方式组织：')

# ---------- P19 intro ----------
p = p.replace('按 P13 的口径，官方 125 题全量逐题输出文档作为独立交付物随本作品提交包提供；此处给出<b>已完成测试面</b>的总体统计（与逐题文档同一判断口径，不以个案代替总体）：',
              '官方 125 题的逐题输出结果单独成册（见 P20 交付清单）；此处给出<b>开发评测阶段已完成测试面</b>的总体统计（判断口径与逐题输出一致，不以个案代替总体）：')

# ---------- P20 delivery table ----------
p = p.replace('<td>调用方式见 P7（百炼 DashScope 适配器，收据逐张留档）；百炼平台最近 30 天模型调用记录截图与应用观测调用数据见提交包凭证材料（材料中不含 API Key）。</td>',
              '<td>调用方式见 P7（百炼 DashScope 适配器，每次调用写入收据账本）；百炼平台调用记录截图见本节凭证区（材料中不含 API Key）。</td>')
p = p.replace('<td>逐题输出结果文档见提交包（单题运行方式、共同输出内容与判断口径见 P13；证据不足、失败或需人工判断的题目原样保留，未省略）。</td>',
              '<td>逐题输出结果单独成册（单题运行方式、共同输出内容与判断口径见 P13；证据不足、失败或需人工判断的题目原样保留，未省略）。</td>')
p = p.replace('<td>演示视频（≤10 分钟）经夸克网盘分享，链接与提取码见提交信息页；内容包含真实路线下的完整研究走查。</td>',
              '<td></td>')

# ---------- P20: remove self-check section, add credential blank area ----------
p = re.sub(r'<h2 class="sub">提交前自检</h2>\s*<ul class="checklist">.*?</ul>\s*', '', p, flags=re.S)
p = p.replace('<p class="small" style="margin-top:10px"><b>知识产权声明：</b>',
              '<h2 class="sub">Qwen 调用凭证</h2>\n<div class="blank mid"></div>\n<p class="small" style="margin-top:10px"><b>知识产权声明：</b>')

# marker
p = p.replace('BLUEPRINT-REDESIGN-V1', 'BLUEPRINT-REDESIGN-V1; CONTENT-FINAL-V2')
(HERE / "doc.html").write_text(p, encoding='utf-8')

# report residual meta tokens
text = re.sub(r'<[^>]+>', ' ', p)
for t in ['提交前', '随提交包', '随本作品提交包提供', '此处', '【', '】', 'fill', '官网提交要求']:
    n = text.count(t)
    if n:
        i = text.find(t)
        print(f'{t!r} x{n}: …{text[max(0,i-40):i+50].strip()}…')
print('fig labels:', re.findall(r'data-label="(图 \d+)"', p))
print('restructured ok')
