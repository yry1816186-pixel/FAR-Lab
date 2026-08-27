# -*- coding: utf-8 -*-
"""S-1 技术方案文档 PDF generator (Report route, ReportLab).
Content mirrors submission/技术方案文档.md (v3, 2026-08-27) — the case table and
body text are embedded here for typesetting control, so edits must be applied to
BOTH files (known mirroring cost; audit P2 accepted for a submission artifact).
Cover: template 01 via cover_render.py, merged as page 1 via pypdf.
Fonts: DengXian (Deng.ttf / Dengb.ttf) — host CJK TTFs, no download.
"""
# ruff: noqa: E402
import sys
import os

PDF_SKILL_DIR = r"C:/Users/RichardYuan/.zcode/cli/plugins/cache/zcode-plugins-official/document-skills/0.1.1/skills/pdf"
_scripts = os.path.join(PDF_SKILL_DIR, "scripts")
if _scripts not in sys.path:
    sys.path.insert(0, _scripts)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle, KeepTogether, Preformatted)
from pdf import install_font_fallback  # skill helper: mixed CJK/Latin glyph fallback

# ---- fonts (host DengXian) ----
pdfmetrics.registerFont(TTFont('Deng', 'C:/Windows/Fonts/Deng.ttf'))
pdfmetrics.registerFont(TTFont('Deng-Bold', 'C:/Windows/Fonts/Dengb.ttf'))
registerFontFamily('Deng', normal='Deng', bold='Deng-Bold', italic='Deng', boldItalic='Deng-Bold')
install_font_fallback()

# ---- palette (cascade output, 2026-08-26) ----
PAGE_BG      = colors.HexColor('#f2f3f3')
CARD_BG      = colors.HexColor('#eaecee')
TABLE_STRIPE = colors.HexColor('#eceff0')
HEADER_FILL  = colors.HexColor('#3d515a')
BORDER       = colors.HexColor('#bec6ca')
ACCENT       = colors.HexColor('#cc354f')
TEXT_PRIMARY = colors.HexColor('#222425')
TEXT_MUTED   = colors.HexColor('#767d80')
SEM_INFO     = colors.HexColor('#5e7fa0')

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '技术方案文档.pdf')

# ---- styles ----
S_BODY = ParagraphStyle('body', fontName='Deng', fontSize=10.5, leading=17.5,
                        alignment=TA_JUSTIFY, wordWrap='CJK', textColor=TEXT_PRIMARY,
                        spaceAfter=6)
S_H1 = ParagraphStyle('h1', fontName='Deng-Bold', fontSize=15, leading=20,
                      textColor=HEADER_FILL, spaceBefore=14, spaceAfter=7)
S_H2 = ParagraphStyle('h2', fontName='Deng-Bold', fontSize=12, leading=17,
                      textColor=TEXT_PRIMARY, spaceBefore=9, spaceAfter=5)
S_KICK = ParagraphStyle('kick', fontName='Deng', fontSize=9, leading=13,
                        textColor=TEXT_MUTED, spaceAfter=2)
S_CARD = ParagraphStyle('card', fontName='Deng', fontSize=10, leading=16.5,
                        alignment=TA_LEFT, wordWrap='CJK', textColor=TEXT_PRIMARY)
S_MONO = ParagraphStyle('mono', fontName='Deng', fontSize=8.6, leading=12.4,
                        textColor=TEXT_PRIMARY)
S_TCELL = ParagraphStyle('tcell', fontName='Deng', fontSize=9.3, leading=14,
                         wordWrap='CJK', textColor=TEXT_PRIMARY)
S_TCELL_B = ParagraphStyle('tcellb', fontName='Deng-Bold', fontSize=9.3, leading=14,
                           wordWrap='CJK', textColor=TEXT_PRIMARY)
S_NOTE = ParagraphStyle('note', fontName='Deng', fontSize=9, leading=14.5,
                        textColor=TEXT_MUTED, wordWrap='CJK')

PAGE_W, PAGE_H = A4
ML = MR = 20 * mm
MT, MB = 18 * mm, 18 * mm
AVAIL_W = PAGE_W - ML - MR


def footer(canv, doc):
    canv.saveState()
    canv.setFont('Deng', 8.5)
    canv.setFillColor(TEXT_MUTED)
    canv.drawString(ML, 12 * mm, 'FAR-Lab · XH-202619 Track 1 / Direction 1 / A · 技术方案文档 v3')
    canv.drawRightString(PAGE_W - MR, 12 * mm, '第 %d 页' % canv.getPageNumber())
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.4)
    canv.line(ML, 15 * mm, PAGE_W - MR, 15 * mm)
    canv.restoreState()


def callout(flow):
    """Light card around a flowable list (invariant/callout blocks)."""
    inner = Table([[flow]], colWidths=[AVAIL_W - 10 * mm])
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 0.6, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return inner


story = []

def P(txt, st=S_BODY):
    return Paragraph(txt, st)
def H1(txt):
    return Paragraph(txt, S_H1)
def H2(txt):
    return Paragraph(txt, S_H2)

# ============ 1 ============
story.append(H1('1. 研究问题与解决方法'))
story.append(H2('1.1 问题定义'))
story.append(P('AI Scientist 的核心困难不是“让大模型写出一段像研究计划的话”，而是<b>证据约束下的可证伪假设生成</b>：当前 LLM 系统普遍存在证据断层（引用与实际检索内容不对齐）、假设同质化（多个“候选”实为同一机制的改写）、可证伪性空转（提出无法判定对错的陈述）、以及反馈与修正脱节（反馈不改变后续输出）。本作品针对 Direction 1-A（科学假设生成与研究计划设计），构建从研究问题到可执行研究计划的完整证据约束闭环。'))
story.append(H2('1.2 解决方法：证据约束的科研闭环 + 迭代控制'))
story.append(P('系统的主循环为十二阶段流水线：<font name="Deng">问题理解 → 文献检索 → 来源验证 → 证据构建 → 假设生成 → 批判与可证伪化 → 排序比较 → 研究计划 → 实验执行 → 反馈 → 修正 → 导出</font>，并在其上叠加三层自适应控制：'))
story.append(P('<b>① 质量门（自适应智能）</b>：排序后对假设集做确定性弱信号检测（头部得分稀薄 / 排序换位分歧 / 竞争者过少），触发<b>恰好一轮</b>有界再生成，将批评注入每个生成策略提示词，并以确定性复述防护阻止第一轮假设的换皮重提。', S_CARD))
story.append(P('<b>② 运行级 token 预算</b>：以真实收据（receipts）为唯一支出权威；预算耗尽后各阶段以 budget_exhausted 真实理由跳过、永不阻塞导出，提高上限后恢复运行时精确重开被跳过的阶段。', S_CARD))
story.append(P('<b>③ 迭代控制器（证伪级联）</b>：完整通过一遍后，若存在可执行的证伪回路腿（实验→反馈→修正→再冻结→再实验），控制器在轮次上限 / 预算 / 无实质增量三重边界内有界重开——全程确定性决策、全程留痕。', S_CARD))
story.append(Spacer(1, 4))
story.append(callout([Paragraph('<b>四条不可协商的科学不变量</b>：主张必须由实际检索内容支持（fail-closed 接地）；分数只是决策辅助（永远披露产出者与校准状态，LLM 判分标注 uncalibrated）；修正必须有因果链（反馈→修订→版本对比可解释）；统计判决机械推导（预注册决策规则，绝不由 LLM 判定实验结论）。', S_CARD)]))

# ============ 2 ============
story.append(H1('2. 架构设计与讲解'))
story.append(H2('2.1 总体架构（五个平面，单一权威）'))
ARCH = ('┌─ 研究者平面 ── Web 工作台(React18+Vite+SSE) / CLI(far) / TUI(Ink,独立包) / 桌面壳(Tauri v2,加固CSP)\n'
        '├─ 编排平面 ──── Orchestrator(租约/checkpoint/恢复) + 迭代控制器 + 质量门 + 预算 + Supervisor(只读观测)\n'
        '├─ 智能平面 ──── 12 阶段流水线 + Agent 内核(工具回合/权限引擎/子代理/MCP/Skills) + 受治理跨运行记忆\n'
        '├─ 执行平面 ──── 实验运行时(Python sidecar, uv 锁定, sklearn/scipy) + 探索性 CodeAct(双静态门)\n'
        '└─ 真值平面 ──── far.db(单一 SQLite 权威: runs/objects/events 只读追加+哈希链/artifacts 内容寻址/receipts)')
arch_tbl = Table([[Preformatted(ARCH, S_MONO)]], colWidths=[AVAIL_W])
arch_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
    ('BOX', (0, 0), (-1, -1), 0.6, BORDER),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
story.append(arch_tbl)
story.append(Spacer(1, 5))
story.append(P('关键架构裁决：<b>一个 stage machine、一个迭代决策者、一个权威存储</b>。Supervisor 是只读轨迹分析（每个阶段边界恰好一条幂等观测笔记），行动权永远在编排器与人类；记忆是 far.db 内受治理投影（无第二记忆库）；事件表迁移 v7 后由数据库触发器强制只读追加（UPDATE/DELETE 中止）+ SHA256 前向哈希链，用户主导的运行删除走特权路径并留墓碑记录。'))

story.append(H2('2.2 Agent 内核与能力生态'))
story.append(P('对话与研究回合运行在同一 Agent 内核上：工具注册表 + 顺序权限引擎（未匹配默认 <b>deny</b>；ask 无处理者在无头环境降级为 deny；strictest-wins；bypass 免疫拒绝）。常驻对话代理携带只读工具面（列运行/看运行详情/看计划/搜工作区/工作区状态）+ propose_action 审批卡（批准/拒绝/记忆授权）；自动化引擎（日程 + 运行完成触发）中<b>记忆授权失效</b>——自动化回合的提案永远门在人类。外部能力以 MCP 服务器接入（如 IBM Docling 文档理解），受<b>能力作用域准入</b>约束：只读证据精炼能力只接入 read 级服务器，非 read 级以 disabled + 策略原因显式拒绝。声明式 hook 规则编译为内核权限（block→不可绕过拒绝，require_approval→精确 (工具,参数) 审批绑定）。'))

story.append(H2('2.3 安全执行基底（认知安全 T0–T5）'))
story.append(P('高权限科研 Agent 的硬边界按 OWASP Agentic 威胁模型分层落地：<b>T1 聚光标记</b>（外部文献内容走独立数据通道 + 统一不可信内容规则，工具结果按来源标记信任级）；<b>T2 污损词汇</b>（域层统一 ContentTaint，外部内容结构性地不可能派生 own 级信任）；<b>T3 工具边界不可信内容策略</b>（参数嵌入不可信载荷特征切片的实效工具调用被拒绝，read 级保持自由）；<b>T5 事件不可变性</b>（数据库触发器 + 哈希链）。探索性 CodeAct（Agent 撰写分析 Python）经<b>双静态门</b>：TS 策略门（网络/子进程/凭据/确证边界/内省逃逸封禁）在任何进程派生<b>之前</b>执行；Python 侧 AST 镜像检查（含 getattr 字符串洗白形式）——2026-08-24 独立对抗审计实证的 dunder 遍历逃逸已在两层同时封禁并有回归测试锁定。探索输出只能是<b>候选发现</b>，晋升为确证性结论必须走确定性门。'))

story.append(H2('2.4 模型控制平面'))
story.append(P('协议无关网关（支持接入全球模型），内置 Zhipu GLM（Anthropic 兼容）与阿里云百炼 DashScope/Qwen 适配器。故障转移链语义经 LiteLLM 源码验证：限速/超时/配额/认证/5xx 在各自重试后转移，400 类与无效输出永不转移；服务路由写入每张收据。使用量账本由收据推导，成本只按用户申报价格计算——未知保持未知，绝不臆造。'))
story.append(P('配套两条工程保障：<b>离线确定性开发路线</b>（wire=offline，无 key、零网络，24 个确定性 purpose 处理器走完整研究流程，全部收据标记 test 模式，实测约 20 秒完成全程并在浏览器中实时观看，用于演示与界面验收而绝不冒充真实模型调用）；<b>默认路线降级预警</b>（2026-08-26 真实配额事故驱动：liveReady 只代表“有 key”而非“可调用”，首页健康条交叉核对默认路线近 24 小时失败记录，配额耗尽时以阻断式告警替代“就绪”徽章并给出切换入口）。'))

# ============ 3 ============
story.append(H1('3. 代表性测试案例（全部来自真实运行记录）'))
CASES = [
    ('A', '真实数据上的假设证伪闭环（2026-08-22，live）', 'OpenML iris 真实获取 → 预注册统计决策规则的实验 spec → sklearn 训练/评估 → StatReport → FeedbackSignal → 假设被机械判决证伪 → 修正 v0→v1 + VersionDiff 持久化并进入导出包。', 'evidence/W-EEL/live-traceable-revision.md'),
    ('B', '引用对齐机器验证（live）', '两次真实运行合计 19/19 主张与检索内容逐字对齐验证通过（P1 15/15 + P2 4/4）；对齐失败 fail-closed。', 'evidence/W-EEL'),
    ('C', '反向证据关系可靠性（live）', '修复前 contradicts 精确率 30%（上界）→ 标签纪律 + 主题门修复后 0/21 错误、盲评精确率 54.5%。', 'evidence/W-EV2/relation-precision.md'),
    ('D', '与强基线同裁判对比（MLR-Bench，N=5）', 'idea 7.00 / proposal 6.20，对比 o4-mini 7.80/7.40、deepseek-r1 7.60/7.00；可行性维度 7.40 超过两个锚点；差距诚实归因，不回避。', '评测证据文件'),
    ('E', '质量门再生成（回归测试驱动真实阶段）', '真实 Orchestrator 驱动真实 generate_hypotheses 阶段，断言第二轮假设确实持久化——此前对抗审计发现再生成标志位死代码（P0），修复并用该真实阶段回归测试锁定。', '测试套件'),
    ('F', '故障注入与恢复（offline 20/20 + live）', '进程击杀→租约收养 5033–5060ms；相同 (spec, seed, env) 双跑逐字节一致；损坏检查点 fail-closed；跨进程取消→恢复续跑。', 'evidence/'),
    ('G', '离线全程浏览器实证 + 产品结构重构（2026-08-26）', '离线路线在真实浏览器完成“预设→发起→实时观看 12 阶段（约 20 秒）→简报/比较表渲染”闭环；工作区留有存活记录（run_p0xjnnyvdak1sc1v656wgh6tna，completed）；同日六个重构批次（简报 answer-first/假设比较表/证据绑定/研究分组/路线预警/离线旅程修复）全部经真实浏览器验收；旅程本身发现并修复三个真实缺陷。', '提交 3df63f5..c38e1f5'),
]
case_rows = [[Paragraph('<b>案例</b>', S_TCELL_B), Paragraph('<b>验证内容</b>', S_TCELL_B), Paragraph('<b>结果</b>', S_TCELL_B), Paragraph('<b>证据</b>', S_TCELL_B)]]
for cid, name, res, ev in CASES:
    case_rows.append([Paragraph('<b>%s</b>' % cid, S_TCELL), Paragraph(name, S_TCELL),
                      Paragraph(res, S_TCELL), Paragraph(ev, S_TCELL)])
cw = [0.08 * AVAIL_W, 0.30 * AVAIL_W, 0.47 * AVAIL_W, 0.15 * AVAIL_W]
case_tbl = Table(case_rows, colWidths=cw, repeatRows=1)
tstyle = [
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]
for i in range(2, len(case_rows), 2):
    tstyle.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
# header text needs white — re-issue header paragraphs in white style
hdr_style = ParagraphStyle('thdr', parent=S_TCELL_B, textColor=colors.white)
case_rows[0] = [Paragraph('<b>案例</b>', hdr_style), Paragraph('<b>验证内容</b>', hdr_style),
                Paragraph('<b>结果</b>', hdr_style), Paragraph('<b>证据</b>', hdr_style)]
case_tbl = Table(case_rows, colWidths=cw, repeatRows=1)
case_tbl.setStyle(TableStyle(tstyle))
case_tbl.hAlign = 'CENTER'
story.append(case_tbl)
story.append(Spacer(1, 5))
story.append(callout([Paragraph('<b>工作区累计真值（2026-08-26 读数）</b>：85+ 个研究运行（52 个完整完成）· 模型调用收据 2951 张 · 累计 931 万 token（三路由真实账本）· 全量确定性测试 2000+ 通过 / 195+ 测试文件 · CI 于真实 GitHub runner 验证绿（run 32983787357），其后提交本地同套门禁全绿（远端重跑受平台 runner 配给故障延迟）。', S_CARD)]))

# ============ 4 ============
story.append(KeepTogether([H1('4. 源代码'),
  P('开源仓库：github.com/yry1816186-pixel/FAR-Lab（Apache-2.0）；npm install 与 npm run build 后执行 far research start “问题” 一分钟内可复现主流程；npm test 全量确定性验证。')]))
story.append(P('工程不变量：Node 产品<b>运行时依赖仅 zod</b>（其余全部 devDependencies）；实验运行时为 uv 锁定的独立 Python sidecar（sklearn/scipy/numpy 版本锁定 + 锁文件哈希入运行记录）；桌面壳为 Tauri v2。'))
story.append(P('<b>诚实边界（如实披露）</b>：官方规定的千问/百炼调用路线的真实凭证验证仍缺 DASHSCOPE_API_KEY（结构已就绪、探针脚本已备，B-QWEN-LIVE-ROUTE）；离线确定性路线覆盖管线全程与对话式创建入口（2026-08-27 修复并经浏览器全程验证）；演示视频与交互前端按官方要求随提交包附上。'))

# ============ 5 ============
story.append(H1('5. 项目工作流程（研究者视角）'))
story.append(P('提问（研究形成页：问题输入 + 粘贴/拖放/显式「引文 / 标识符」入口同一条摄入管线 + Zotero 本地库引入 + 离线语音听写；启动前「会发生什么」四步说明常驻，也可经常驻对话打磨问题后一键启动）→ <b>研究地图</b>（单画布 answer-first）：研究问题 → 证据带（参与反证的主张置顶、来源逐条可追）→ 排序假设卡 → 当前判断（主要不确定性、未决反证、下一步）；任意对象点击即在右侧 inspector 展开完整卡片 → <b>研究者直接操作</b>：主张可排除/固定/连接到假设（支持/反对），排除后假设区分度按剩余证据即时重算（「研究者调整视图」与存储的原始分析两个视图并存披露）；假设可编辑陈述/推进/否决/分叉，编辑与 AI 反馈进入同一条因果修订链（human_expert 反馈→修订前后对比→版本号递增→陈旧性不确定性披露）→ <b>深层工具层</b>（研究地图「下一步」行进入，按需展开）：评分卡与维度分解（“为什么排第一”的评分理据、GRADE 证据体评级、ACH 判别性证据交叉表——全部确定性计算而非模型判分；跨单元多重检验政策单一权威）、反馈与修订历史、研究计划与确证性实验（声明 MDE，批准时快照当前证伪决策规则，重新校验 fail-closed）、观察迭代轮（时间轴逐轮显示重开阶段与触发原因）、核验与导出 → 导出研究产品（确定性 IMRaD 论文投影：局限性由真实计数合成、BibTeX 只来自存储元数据）+ 一键可复现包（far verify 独立校验）。首页为研究工作区：判断队列（进行中/失败待恢复/反证待审视）+ 研究索引（同一问题的多次运行归并为一个研究条目）。全程执行模式显式标识（LIVE / OFFLINE / RECORDED / SYNTHETIC——研究地图顶栏徽章 + 执行真实性面板）；路线失败（如配额耗尽）时研究进入失败态、首页判断队列按研究者语言显示原因，可从断点恢复，而非起步阶段静默失败或全部重来。'))

# ============ 6 ============
story.append(H1('6. 上下文工程设计'))
story.append(P('<b>通道分离</b>：外部文献文本经 untrustedSourceContent 独立数据通道进入提示词，并附加显式不可信内容规则——这是提示注入防御的 T1 层。'))
story.append(P('<b>有界信息寻求</b>：首轮证据贫瘠时允许恰好一轮定向补检索（≤2 查询、每查询 ≤3 文档），永不开放循环。'))
story.append(P('<b>负面条件化</b>：假设生成后续策略可见先前已提主张，防止同质化；跨运行记忆对重复方向施加负面条件。'))
story.append(P('<b>技能条件注入</b>：内建/用户两级技能按相关性选择注入（≤3 项、≤4000 字符）。'))
story.append(P('<b>受治理记忆</b>：终态运行确定性投影为情景记忆与实验结论记忆（失败结论<b>必须</b>携带失败原因，zod + SQL CHECK 双层强制）；检索为确定性零 LLM（FTS5 + ACT-R 激活排序）；替代为只追加（被替代项保留审计）。'))

# ============ 7 ============
story.append(H1('7. 数据或资料来源说明'))
story.append(P('文献证据全部来自真实检索源：OpenAlex、arXiv、CrossRef、EuropePMC（+全文阶段：arXiv LaTeXML / OpenAlex GROBID TEI）。每个来源保存不可变快照（内容寻址 artifact + 可解析溯源），主张-来源绑定逐字可验证；统计实验数据来自 OpenML 真实数据集（校验和/许可/谱系持久化，种子可复现切分）。评测基准：MLR-Bench、POPPER 式重发现（5 任务，mean F1 0.58，2/5 完美重发现，评判步方差 ±0.5 task-F1 如实披露）、裁判方差研究（worstTaskSwing 0.061 < 0.15 目标）。'))

# ============ 8 ============
story.append(H1('8. 结果展示与反馈迭代过程'))
story.append(P('<b>量化进步（同裁判前后对比）</b>：主张数 +40%（58→81）、反向证据关系 +104%（均值 16→32.67）、token 成本 +84.5% 如实记录；单维不宣称全域优势（18 个质量格中 6 格落后于最佳基线，如实列出）。'))
story.append(P('<b>反馈迭代的三条真实路径</b>：① 结构化专家反馈→因果修订（含真实的克隆混杂批评案例）；② 研究者直接编辑→同一因果链；③ 实验判决→FeedbackSignal→修正→再实验（迭代控制器有界级联）。'))
story.append(P('<b>自我纠错的诚实记录</b>：对抗审计曾抓到再生成死代码 P0（已修+真实阶段回归锁）、探索沙箱 dunder 逃逸 P1（双层封禁+回归测试）、关系标签 30% 错误率（根因修复后 live 复测 0/21）——所有被抓住的缺陷及其修复都是系统能力的一部分，而非需要隐藏的污点。2026-08-26 的离线浏览器旅程延续同一纪律：一次旅程发现并修复离线预设半成品表单、前端 wire 枚举契约漂移（保存成功却报结构不符）、阶段计数口径混淆三个真实缺陷。'))
story.append(P('<b>已知边界</b>：官方路线凭证待补；多轮真实工作区运行与 live 对比基准等待 live 路由恢复（2026-08-29 后或用户提供新路由）；领域包（天文/生物/化学等）当前为通用科研核心 + 待扩展域语义。'))
story.append(Spacer(1, 8))
story.append(Paragraph('本文档数字全部来自仓库证据文件与真实运行读数；页限按两个官方页面中严格者（20 页）准备。', S_NOTE))

# ---- build body ----
doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=ML, rightMargin=MR,
                      topMargin=MT, bottomMargin=MB,
                      title='基于 FAR-Lab 的科学假设生成与研究计划设计系统 — 技术方案文档',
                      author='袁荣岳', subject='XH-202619 Track 1 Direction 1A 技术方案')
frame = Frame(ML, MB, AVAIL_W, PAGE_H - MT - MB, id='main')
doc.addPageTemplates([PageTemplate(id='page', frames=[frame], onPage=footer)])
doc.build(story)
print('body pages written:', OUT)

# ---- cover (template 01) + merge ----
from cover_render import render_cover
from pypdf import PdfReader, PdfWriter
content = {
    "kicker": "XH-202619 · 基于国产开源大模型的 AI Scientist · Track 1 / Direction 1 / A",
    "hero": "FAR-Lab 研究工作台",
    "summary": "证据约束、可证伪、可修订的科学假设生成与研究计划设计系统：从研究问题出发，经真实文献检索、来源核验、主张-证据绑定、多假设对抗排序，到可执行研究计划、确定性实验判决与可复现导出的完整闭环。",
    "meta": "技术方案文档 v2 · 2026 年 8 月 · 袁荣岳",
    "footer": "FAR-LAB · TECHNICAL PROPOSAL · S-1",
    "footer_left": "XH-202619 Track 1-A", "footer_right": "2026 年 8 月",
    "year": "2026", "word": "PROPOSAL",
}
cover_path = OUT.replace('.pdf', '_cover_tmp.pdf')
render_cover('01', content, cover_path)
w = PdfWriter()
for src in (cover_path, OUT):
    for pg in PdfReader(src).pages:
        w.add_page(pg)
final = OUT
with open(final, 'wb') as f:
    w.write(f)
os.remove(cover_path)
n = len(PdfReader(final).pages)
print('FINAL:', final, 'pages:', n)
