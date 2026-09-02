# -*- coding: utf-8 -*-
"""FAR-Lab 挑战杯提交文档配图生成器（20 张）。
统一科技蓝学术风格；所有数字来自仓库证据（evidence/、eval/、.far-run/far.db）。
输出: submission/final/figs/*.png  (200 DPI)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.executable).parent.parent.parent))
from daimon_runtime import setup_plot  # noqa: E402

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle, Rectangle  # noqa: E402

setup_plot()
plt.rcParams["font.size"] = 12

OUT = Path(__file__).parent
DPI = 200

# ---- palette ----
INK    = "#1B2A41"
DEEP   = "#0B3D91"
BLUE   = "#2563EB"
SKY    = "#DBEAFE"
SKY2   = "#EFF6FF"
CYAN   = "#0E7490"
CYANL  = "#CFFAFE"
GREEN  = "#059669"
GREENL = "#D1FAE5"
RED    = "#DC2626"
REDL   = "#FEE2E2"
AMBER  = "#D97706"
AMBERL = "#FEF3C7"
GRAY   = "#64748B"
GRAYL  = "#E2E8F0"
BORDER = "#94A3B8"
WHITE  = "#FFFFFF"


def new_fig(w_in, h_in):
    fig = plt.figure(figsize=(w_in, h_in), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w_in * 100)
    ax.set_ylim(0, h_in * 100)
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, text, fc=BLUE, ec="none", tc="white", fs=12, bold=True,
        r=5, lw=1.4, ls=1.5):
    p = FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                       fc=fc, ec=ec, lw=lw, mutation_aspect=1)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            color=tc, weight="bold" if bold else "normal", linespacing=ls, zorder=5)


def pill(ax, x, y, w, h, text, fc, tc, fs=10.5, ec="none", bold=True):
    box(ax, x, y, w, h, text, fc=fc, ec=ec, tc=tc, fs=fs, bold=bold, r=h / 2)


def arrow(ax, x1, y1, x2, y2, color=GRAY, lw=2.4, style="-|>", cs=None, alpha=1.0, ls="-"):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=16,
                        color=color, lw=lw, shrinkA=2, shrinkB=2, alpha=alpha,
                        connectionstyle=cs, linestyle=ls, zorder=3)
    ax.add_patch(a)


def label(ax, x, y, text, fs=10.5, color=GRAY, ha="center", bold=False, ls=1.4):
    ax.text(x, y, text, ha=ha, va="center", fontsize=fs, color=color,
            weight="bold" if bold else "normal", linespacing=ls)


def title_tag(ax, x, y, text, fc=DEEP):
    ax.text(x, y, text, ha="left", va="center", fontsize=13, color=fc, weight="bold")


def save(fig, name):
    fig.savefig(OUT / name, dpi=DPI, facecolor="white")
    plt.close(fig)
    print("saved", name)


# =====================================================================
# 图1 总体思路图（P2）
# =====================================================================
def fig01():
    fig, ax = new_fig(11.5, 3.5)
    nodes = [
        ("科学问题", "问题理解\n结构化解析", DEEP),
        ("知识缺口", "已知/争议/未知\n三分离", DEEP),
        ("科学证据", "真实文献检索\n逐字绑定", BLUE),
        ("候选假设", "多策略生成\n可证伪表达", BLUE),
        ("比较筛选", "锦标赛排序\nACH 判别", CYAN),
        ("研究计划", "可执行步骤\n决策规则", CYAN),
        ("反馈修订", "因果链版本\n有界迭代", GREEN),
    ]
    n = len(nodes); W = 136; H = 96; gap = (1150 - n * W) / (n - 1)
    y = 150
    for i, (t, s, c) in enumerate(nodes):
        x = 10 + i * (W + gap)
        box(ax, x, y, W, H, "", fc=c, r=8)
        label(ax, x + W / 2, y + H - 22, t, fs=13.5, color="white", bold=True)
        label(ax, x + W / 2, y + 28, s, fs=9.5, color="#EAF2FF")
        if i < n - 1:
            arrow(ax, x + W + 2, y + H / 2, x + W + gap - 2, y + H / 2, color=BORDER, lw=2.6)
    # 修订回路（从节点下方绕行）
    x_last = 10 + 6 * (W + gap) + W / 2
    x_evi = 10 + 2 * (W + gap) + W / 2
    arrow(ax, x_last, y - 4, x_last, 58, color=GREEN, lw=2.6, style="-")
    arrow(ax, x_last, 58, x_evi, 58, color=GREEN, lw=2.6, style="-")
    arrow(ax, x_evi, 58, x_evi, y - 4, color=GREEN, lw=2.6)
    label(ax, (x_last + x_evi) / 2, 34, "证据 / 反馈 / 实验判决驱动的修订回路（全程留痕、因果可解释）",
          fs=11, color=GREEN, bold=True)
    label(ax, 575, 320, "证据约束下的科研闭环：从科学问题到可执行研究计划，再由反馈驱动修订", fs=13.5,
          color=INK, bold=True)
    save(fig, "fig01_loop.png")


# =====================================================================
# 图2 十二阶段流水线 + 三层自适应控制（P2/P6）
# =====================================================================
def fig02():
    fig, ax = new_fig(11.5, 4.6)
    stages = [
        ("① 问题理解", "scope"), ("② 文献检索", "retrieve"), ("③ 来源验证", "verify"),
        ("④ 证据构建", "align/evidence"), ("⑤ 假设生成", "hypotheses"),
        ("⑥ 批判与\n可证伪化", "falsify"), ("⑦ 排序比较", "rank"),
        ("⑧ 研究计划", "plan"), ("⑨ 实验执行", "execute"),
        ("⑩ 反馈", "feedback"), ("⑪ 修正", "revise"), ("⑫ 导出", "export"),
    ]
    # two rows of 6
    W, H = 165, 74
    xs0, ys0 = 20, 300
    gapx = (1150 - 2 * 20 - 6 * W) / 5
    for i, (t, en) in enumerate(stages):
        row, col = divmod(i, 6)
        x = 20 + col * (W + gapx)
        y = ys0 - row * 150
        c = DEEP if i < 4 else (BLUE if i < 8 else CYAN)
        box(ax, x, y, W, H, "", fc=c, r=7)
        label(ax, x + W / 2, y + H - 20, t, fs=11.5, color="white", bold=True)
        label(ax, x + W / 2, y + 16, en, fs=8.5, color="#DCE9FF")
        if i % 6 != 5:
            arrow(ax, x + W + 1, y + H / 2, x + W + gapx - 1, y + H / 2, color=BORDER, lw=2.2)
    # row wrap arrow: ⑥ → 向下折返至第二行左端 ⑦
    x_end = 20 + 5 * (W + gapx) + W
    y1m, y2m = ys0 + H / 2, ys0 - 150 + H / 2
    arrow(ax, x_end + 1, y1m, x_end + 24, y1m, color=BORDER, lw=2.2, style="-")
    arrow(ax, x_end + 24, y1m, x_end + 24, y2m, color=BORDER, lw=2.2, style="-")
    arrow(ax, x_end + 24, y2m, 8, y2m, color=BORDER, lw=2.2, style="-")
    arrow(ax, 8, y2m, 18, y2m, color=BORDER, lw=2.2)
    # feedback loop from ⑪ back to ⑤
    x5 = 20 + 4 * (W + gapx) + W / 2
    x11 = 20 + 4 * (W + gapx) + W / 2
    # control layers band
    band_y = 26
    ctrl = [
        ("质量门（自适应智能）", "弱信号检测 → 恰好一轮有界再生成\n批评注入 + 复述防护", AMBER, AMBERL),
        ("运行级 Token 预算", "收据为唯一支出权威\n耗尽跳过·恢复精确重开", CYAN, CYANL),
        ("迭代控制器（证伪级联）", "轮次/预算/无增量三重边界\n内有界重开·全程确定性", GREEN, GREENL),
    ]
    CW = 356; CH = 92
    cgap = (1150 - 40 - 3 * CW) / 2
    for i, (t, s, c, cl) in enumerate(ctrl):
        x = 20 + i * (CW + cgap)
        box(ax, x, band_y, CW, CH, "", fc=cl, ec=c, lw=1.6, r=7)
        label(ax, x + CW / 2, band_y + CH - 20, t, fs=11.5, color=c, bold=True)
        label(ax, x + CW / 2, band_y + 26, s, fs=9.5, color=INK)
    arrow(ax, 575, band_y + CH + 6, 575, ys0 - 150 - 8, color=GRAY, lw=2.0, ls=(0, (4, 3)))
    label(ax, 575, 446, "十二阶段科研流水线（确定性状态机）+ 三层自适应控制", fs=13.5, color=INK, bold=True)
    save(fig, "fig02_pipeline.png")


# =====================================================================
# 图3 系统总体架构（五平面）——旗舰图（P6）
# =====================================================================
def fig03():
    fig, ax = new_fig(12.2, 7.0)
    LX, LW = 18, 940          # lanes
    lanes = [
        ("研究者平面", 566, 96, "#F5F8FF"),
        ("编排平面",   446, 96, "#EFF6FF"),
        ("智能平面",   268, 154, "#F0F9FF"),
        ("执行平面",   148, 96, "#F0FDFA"),
        ("真值平面",    28, 96, "#F8FAFC"),
    ]
    for name, y, h, fc in lanes:
        ax.add_patch(Rectangle((LX, y), LW, h, fc=fc, ec=BORDER, lw=1.0))
        ax.add_patch(Rectangle((LX, y), 10, h, fc=DEEP, ec="none"))
        label(ax, LX + 24, y + h - 16, name, fs=12.5, color=DEEP, ha="left", bold=True)
    # 研究者平面
    y = 566
    for i, t in enumerate(["Web 工作台\nReact18+Vite+SSE", "CLI（far）", "TUI（Ink）", "桌面壳\nTauri v2 加固 CSP"]):
        box(ax, 70 + i * 220, y + 14, 200, 52, t, fc=DEEP, fs=10, r=6)
    # 编排平面
    y = 446
    for i, t in enumerate(["Orchestrator\n租约·检查点·恢复", "迭代控制器\n证伪级联", "质量门\n自适应再生成", "Supervisor\n只读观测"]):
        box(ax, 70 + i * 220, y + 14, 200, 52, t, fc=BLUE, fs=10, r=6)
    # 智能平面
    y = 268
    box(ax, 70, y + 78, 420, 62, "十二阶段科研流水线\n问题理解→…→修正→导出", fc=CYAN, fs=10.5, r=6)
    box(ax, 510, y + 78, 430, 62, "Agent 内核\n工具回合·权限引擎·子代理·MCP·Skills", fc=CYAN, fs=10.5, r=6)
    box(ax, 70, y + 8, 420, 56, "受治理跨运行记忆\n确定性检索（零 LLM）·只追加替代", fc="#0891B2", fs=10, r=6)
    box(ax, 510, y + 8, 430, 56, "模型控制平面（协议无关网关）\n百炼 DashScope/Qwen · GLM · 自定义", fc="#0891B2", fs=10, r=6)
    # 执行平面
    y = 148
    box(ax, 70, y + 14, 420, 52, "实验运行时（Python sidecar）\nuv 锁定 · sklearn/scipy · 版本哈希入档", fc=GREEN, fs=10, r=6)
    box(ax, 510, y + 14, 430, 52, "探索性 CodeAct\n双静态门（TS 策略门 + Python AST 镜像）", fc=GREEN, fs=10, r=6)
    # 真值平面
    y = 28
    box(ax, 70, y + 14, 870, 52,
        "far.db 单一权威（SQLite）  runs/objects · events 只读追加 + SHA256 哈希链 · artifacts 内容寻址 · receipts 收据账本",
        fc=INK, fs=10.5, r=6)
    # 右侧外部实体
    RX = 986; RW = 216
    box(ax, RX, 566, RW, 52, "人工参与\n审批·编辑·专家反馈", fc=AMBER, fs=10, r=6)
    box(ax, RX, 400, RW, 52, "阿里云百炼\nQwen 系列模型", fc="#FF6A00", fs=10, r=6)
    box(ax, RX, 268, RW, 52, "外部文献源\nOpenAlex·arXiv\nCrossRef·EuropePMC", fc=GRAY, fs=9.5, r=6)
    box(ax, RX, 148, RW, 52, "OpenML 数据集\n真实统计数据", fc=GRAY, fs=9.5, r=6)
    box(ax, RX, 28, RW, 52, "MCP 外部工具\n能力作用域准入", fc=GRAY, fs=9.5, r=6)
    # cross arrows
    arrow(ax, 1094, 566, 1094, 510, color=AMBER, lw=2.2)          # 人工 -> 编排
    arrow(ax, 986, 426, 940, 470, color="#FF6A00", lw=2.4)        # 百炼 -> 编排/智能
    label(ax, 965, 452, "收据", fs=9, color="#FF6A00", bold=True)
    arrow(ax, 986, 294, 940, 300, color=GRAY, lw=2.2)             # 文献 -> 智能
    label(ax, 962, 312, "快照", fs=9, color=GRAY, bold=True)
    arrow(ax, 986, 174, 940, 174, color=GRAY, lw=2.2)
    # vertical flow between lanes
    for x in (300, 700):
        arrow(ax, x, 566, x, 548, color=BORDER, lw=2.0)
        arrow(ax, x, 446, x, 428, color=BORDER, lw=2.0)
        arrow(ax, x, 268, x, 250, color=BORDER, lw=2.0)
        arrow(ax, x, 148, x, 130, color=BORDER, lw=2.0)
    label(ax, 18, 686, "五个平面 · 单一权威 · 模型可插拔", fs=14, color=INK, ha="left", bold=True)
    save(fig, "fig03_architecture.png")


# =====================================================================
# 图4 真值平面数据流（P6）
# =====================================================================
def fig04():
    fig, ax = new_fig(11.5, 4.3)
    # central db
    box(ax, 430, 150, 290, 130, "", fc=INK, r=10)
    label(ax, 575, 252, "far.db（单一权威 SQLite）", fs=13, color="white", bold=True)
    label(ax, 575, 196, "runs / objects / events / artifacts / receipts\n真理的唯一来源，其余皆为投影", fs=10, color="#CBD5E1")
    # left: writers
    lw_ = [("流水线阶段产物", "假设·计划·证据关系", BLUE),
           ("模型调用收据", "provider/model/用量哈希", CYAN),
           ("研究者操作", "编辑·排除·审批", AMBER)]
    for i, (t, s, c) in enumerate(lw_):
        y = 300 - i * 110
        box(ax, 30, y, 300, 76, "", fc="white", ec=c, lw=1.8, r=7)
        label(ax, 180, y + 50, t, fs=11.5, color=c, bold=True)
        label(ax, 180, y + 22, s, fs=9.5, color=GRAY)
        arrow(ax, 332, y + 38, 426, 215, color=c, lw=2.2)
    # right: readers
    rw_ = [("Web/CLI/TUI 渲染", "状态全部来自真值投影", GREEN),
           ("导出与可复现包", "IMRaD 论文 + far verify", GREEN),
           ("跨运行记忆投影", "FTS5 + ACT-R 激活", GREEN)]
    for i, (t, s, c) in enumerate(rw_):
        y = 300 - i * 110
        box(ax, 820, y, 300, 76, "", fc="white", ec=c, lw=1.8, r=7)
        label(ax, 970, y + 50, t, fs=11.5, color=c, bold=True)
        label(ax, 970, y + 22, s, fs=9.5, color=GRAY)
        arrow(ax, 724, 215, 816, y + 38, color=c, lw=2.2)
    # bottom guards
    for i, t in enumerate(["事件表只读追加\nDB 触发器强制", "SHA256 前向哈希链\n篡改可检测", "内容寻址 artifact\n不可变快照", "特权删除留墓碑\n可审计"]):
        pill(ax, 40 + i * 285, 20, 265, 56, t, SKY2, DEEP, fs=9.5)
    label(ax, 575, 412, "真值平面：写入皆留痕，读取皆投影", fs=13, color=INK, bold=True)
    save(fig, "fig04_truth.png")


# =====================================================================
# 图5 人在回路机制（P6）
# =====================================================================
def fig05():
    fig, ax = new_fig(11.5, 4.2)
    box(ax, 60, 150, 300, 120, "", fc=AMBER, r=10)
    label(ax, 210, 238, "研究者（人）", fs=14, color="white", bold=True)
    label(ax, 210, 190, "判断·领域知识·价值选择", fs=10, color="#FFF7E6")
    box(ax, 790, 150, 300, 120, "", fc=BLUE, r=10)
    label(ax, 940, 238, "FAR-Lab 系统", fs=14, color="white", bold=True)
    label(ax, 940, 190, "提案·证据组织·机械校验", fs=10, color="#EAF2FF")
    acts = [
        ("审批卡 propose_action（批准/拒绝/记忆授权）", 340),
        ("直接编辑假设 / 排除·固定主张 / 连接证据", 290),
        ("结构化专家反馈 → 因果修订链", 240),
        ("实验批准时快照证伪决策规则（预注册）", 190),
        ("自动化回合提案永远门在人类（记忆授权失效）", 140),
    ]
    for t, y in acts:
        arrow(ax, 366, y, 784, y, color=AMBER, lw=2.0)
        label(ax, 575, y + 16, t, fs=10, color=INK)
    arrow(ax, 784, 105, 366, 105, color=BLUE, lw=2.2)
    label(ax, 575, 122, "中间结果与不确定性实时可见：证据带 / 排序理据 / 版本差异 / 执行真实性标识",
        fs=10, color=BLUE, bold=True)
    label(ax, 575, 392, "“LLM 提案、确定性处置、人类裁决”——任何自动化都不替代研究者判断", fs=13,
          color=INK, bold=True)
    save(fig, "fig05_hitl.png")




# =====================================================================
# 图6 上下文工程结构示意（P7）
# =====================================================================
def fig06():
    fig, ax = new_fig(11.5, 4.8)
    chans = [
        ("科学问题", "结构化解析：研究对象·变量·约束", DEEP, SKY2),
        ("已有证据", "验证通过的主张（逐字绑定来源快照）", BLUE, SKY2),
        ("反对证据", "contradicts/weakens 关系，置顶呈现", RED, REDL),
        ("关键约束", "问题约束 + 可行性边界", CYAN, CYANL),
        ("历史结果", "受治理跨运行记忆（负面条件化）", GREEN, GREENL),
        ("反馈信息", "实验判决 / 专家反馈 / 质量门批评", AMBER, AMBERL),
    ]
    for i, (t, s, c, cl) in enumerate(chans):
        y = 356 - i * 62
        box(ax, 30, y, 330, 50, "", fc="white", ec=c, lw=1.8, r=6)
        ax.add_patch(Rectangle((30, y), 8, 50, fc=c, ec="none"))
        label(ax, 52, y + 32, t, fs=11.5, color=c, ha="left", bold=True)
        label(ax, 52, y + 12, s, fs=9, color=GRAY, ha="left")
        arrow(ax, 366, y + 25, 545, 215, color=c, lw=1.8, alpha=0.85)
    # center model
    box(ax, 550, 150, 240, 130, "", fc=DEEP, r=10)
    label(ax, 670, 238, "Qwen 大模型", fs=14, color="white", bold=True)
    label(ax, 670, 196, "结构化输出（JSON Schema strict）\n温度/种子/路由全部入收据", fs=9.5, color="#DCE9FF")
    # untrusted channel note
    box(ax, 830, 240, 300, 100, "", fc=REDL, ec=RED, lw=1.6, r=7)
    label(ax, 980, 316, "不可信内容通道（T1/T2）", fs=11, color=RED, bold=True)
    label(ax, 980, 276, "外部文献文本经独立数据通道进入\n统一不可信规则 + 信任级标记\n结构性不可能派生高信任级", fs=9, color=INK)
    arrow(ax, 794, 260, 826, 275, color=RED, lw=2.0)
    box(ax, 830, 100, 300, 100, "", fc=GREENL, ec=GREEN, lw=1.6, r=7)
    label(ax, 980, 176, "防无依据生成措施", fs=11, color=GREEN, bold=True)
    label(ax, 980, 136, "负面条件化防同质化\n有界信息寻求（≤2查询×≤3文档）\n技能条件注入（≤3项·≤4000字符）", fs=9, color=INK)
    arrow(ax, 794, 175, 826, 160, color=GREEN, lw=2.0)
    label(ax, 575, 448, "一次生成时的上下文组织：六路输入 · 可信边界显式分离", fs=13.5, color=INK, bold=True)
    save(fig, "fig06_context.png")


# =====================================================================
# 图7 模型控制平面与故障转移（P7）
# =====================================================================
def fig07():
    fig, ax = new_fig(11.5, 4.4)
    box(ax, 40, 170, 250, 100, "", fc=DEEP, r=9)
    label(ax, 165, 238, "协议无关网关", fs=13, color="white", bold=True)
    label(ax, 165, 198, "统一契约 · 能力注册协商\njson_schema strict 探测", fs=9, color="#DCE9FF")
    provs = [
        ("阿里云百炼 DashScope", "Qwen 系列（qwen-plus / qwen3.x）\n赛事规定调用路线", "#FF6A00"),
        ("智谱 GLM（Anthropic 兼容）", "glm-4.6 等 · 评测对比路线", BLUE),
        ("自定义 OpenAI 兼容端点", "模型可插拔 · 产品模型无关", GRAY),
    ]
    for i, (t, s, c) in enumerate(provs):
        y = 320 - i * 105
        box(ax, 460, y, 380, 82, "", fc="white", ec=c, lw=2.0, r=7)
        label(ax, 650, y + 56, t, fs=11.5, color=c, bold=True)
        label(ax, 650, y + 24, s, fs=9, color=INK)
        arrow(ax, 294, 220, 456, y + 41, color=c, lw=2.0)
    # failover semantics
    box(ax, 890, 240, 260, 180, "", fc=SKY2, ec=BLUE, lw=1.6, r=8)
    label(ax, 1020, 396, "故障转移语义（确定性）", fs=11, color=DEEP, bold=True)
    label(ax, 902, 330, "可转移：限速/超时/配额/认证/5xx\n（各自重试后转移）\n\n永不转移：400 类请求错误\n与无效输出", fs=9.5, color=INK, ha="left")
    arrow(ax, 844, 300, 886, 320, color=BLUE, lw=2.0)
    # receipts
    box(ax, 890, 60, 260, 130, "", fc=GREENL, ec=GREEN, lw=1.6, r=8)
    label(ax, 1020, 166, "收据账本（receipts）", fs=11, color=GREEN, bold=True)
    label(ax, 902, 112, "每次调用记录 provider/模型/\n用量/延迟/请求与输出哈希\n成本仅按申报价格计算", fs=9.5, color=INK, ha="left")
    arrow(ax, 730, 170, 730, 125, color=GREEN, lw=2.0, style="-")
    arrow(ax, 730, 125, 886, 125, color=GREEN, lw=2.0)
    label(ax, 165, 120, "服务路由写入每张收据", fs=10, color=GRAY)
    arrow(ax, 165, 166, 165, 138, color=GRAY, lw=1.6)
    label(ax, 575, 428, "模型控制平面：接入全球模型，赛事路线即插即用", fs=13.5, color=INK, bold=True)
    save(fig, "fig07_modelroute.png")


# =====================================================================
# 图8 问题理解→知识缺口（P8，含真实中间结果）
# =====================================================================
def fig08():
    fig, ax = new_fig(11.5, 5.2)
    steps = [
        ("识别研究对象与范围", "实体抽取 + 领域归类\n形成研究边界"),
        ("提取已有条件与关键变量", "自变量/因变量/对照\n可观测量化指标"),
        ("区分已有认识·争议·未知", "文献共识 vs 冲突证据\nvs 无覆盖区域"),
        ("形成可处理知识缺口", "缺口陈述 + 约束清单\n驱动定向再检索"),
    ]
    W, H = 240, 120
    for i, (t, s) in enumerate(steps):
        x = 30 + i * 285
        box(ax, x, 300, W, H, "", fc=SKY2, ec=BLUE, lw=1.8, r=8)
        box(ax, x + 12, 300 + H - 40, 56, 28, f"STEP {i+1}", fc=BLUE, fs=9.5, r=14)
        label(ax, x + W / 2 + 14, 300 + H - 26, t, fs=11, color=DEEP, bold=True)
        label(ax, x + W / 2, 300 + 34, s, fs=9.5, color=INK)
        if i < 3:
            arrow(ax, x + W + 2, 360, x + 283, 360, color=BORDER, lw=2.2)
    # real example strip (P1 run)
    box(ax, 30, 30, 1120, 230, "", fc="#FBFDFF", ec=BORDER, lw=1.4, r=8)
    label(ax, 56, 232, "真实中间结果示例（2026-08-29 真实 live 运行；问题：医院环境中抗生素耐药基因水平转移的驱动机制）",
          fs=11, color=DEEP, ha="left", bold=True)
    cols = [
        ("研究对象", "医院环境（废水系统、\n表面生物膜）中 ARG\n水平基因转移", DEEP),
        ("关键变量", "转移频率（T/D）·\n生物膜态/浮游态 ·\n消毒剂/药物残留浓度", BLUE),
        ("已有认识", "接合/转导/转化三途径；\n生物膜促进接合；\n亚抑菌浓度诱导 SOS", CYAN),
        ("知识缺口", "非抗生素药物与物理\n剪切等作用权重未知；\n多机制贡献无法区分", AMBER),
        ("约束", "证据须来自可解析来源；\n假设须给出可观测\n判别性预测", GREEN),
    ]
    CW = 204
    for i, (t, s, c) in enumerate(cols):
        x = 52 + i * (CW + 14)
        box(ax, x, 52, CW, 156, "", fc="white", ec=c, lw=1.6, r=7)
        label(ax, x + CW / 2, 186, t, fs=11, color=c, bold=True)
        label(ax, x + CW / 2, 116, s, fs=9, color=INK)
    label(ax, 575, 500, "科学问题理解 → 知识缺口识别（确定性四步）", fs=13.5, color=INK, bold=True)
    save(fig, "fig08_scope.png")


# =====================================================================
# 图9 候选假设生成机制（P9）
# =====================================================================
def fig09():
    fig, ax = new_fig(11.5, 4.9)
    strats = [
        ("证据条件化策略", "evidence_conditioned\n从验证主张直接外推机制", BLUE),
        ("机制驱动策略", "mechanism_driven\n上游原因→中介→可观测结果", CYAN),
        ("矛盾驱动策略", "contradiction_driven\n针对证据间张力提出解释", AMBER),
    ]
    for i, (t, s, c) in enumerate(strats):
        y = 330 - i * 105
        box(ax, 30, y, 330, 84, "", fc="white", ec=c, lw=1.8, r=7)
        label(ax, 195, y + 58, t, fs=11.5, color=c, bold=True)
        label(ax, 195, y + 26, s, fs=9, color=GRAY)
        arrow(ax, 364, y + 42, 500, 245, color=c, lw=2.0)
    box(ax, 505, 180, 220, 130, "", fc=DEEP, r=10)
    label(ax, 615, 272, "候选假设池", fs=13, color="white", bold=True)
    label(ax, 615, 216, "统一结构化表达\n陈述·机制·依据·预测\n支持/反对证据·不确定性", fs=9, color="#DCE9FF")
    # negative conditioning note
    box(ax, 30, 30, 330, 100, "", fc=AMBERL, ec=AMBER, lw=1.6, r=7)
    label(ax, 195, 106, "负面条件化", fs=11, color=AMBER, bold=True)
    label(ax, 195, 62, "后续策略可见先前已提主张\n跨运行记忆对重复方向施加抑制\n质量门触发恰好一轮有界再生成", fs=9, color=INK)
    arrow(ax, 360, 80, 540, 176, color=AMBER, lw=2.0, ls=(0, (4, 3)))
    # dedup
    box(ax, 790, 180, 330, 130, "", fc="white", ec=GREEN, lw=1.8, r=8)
    label(ax, 955, 282, "聚类去重 + 区分度理据", fs=11.5, color=GREEN, bold=True)
    label(ax, 955, 232, "clusterKey 机制聚类\n每个代表假设携带 distinctnessRationale\n（真实例：同为 SOS 机制，诱导物与\n生态语境不同 → 保留为独立候选）", fs=9, color=INK)
    arrow(ax, 729, 245, 786, 245, color=GREEN, lw=2.2)
    label(ax, 575, 452, "多策略并行生成：来源可区分、彼此可区分、逐条可证伪", fs=13.5, color=INK, bold=True)
    save(fig, "fig09_generation.png")


# =====================================================================
# 图10 假设核验与筛选漏斗（P10，真实数字）
# =====================================================================
def fig10():
    fig, ax = new_fig(11.5, 6.1)
    stages = [
        ("12 条候选假设", "多策略生成（含去重聚类）", 1060, DEEP),
        ("主题相关性门", "确定性 topical gate：主题距离过远的\n证据链接被丢弃并留警示", 880, BLUE),
        ("证据一致性核验", "103 条主张—假设关系（支持 91·限定 9·\n反对 1·削弱 1·待判 1）", 700, CYAN),
        ("可证伪完整性检查", "逐条检查可观测变量·对照·阈值·\n决策规则（4 字段）", 520, GREEN),
        ("锦标赛成对比较", "8 强淘汰赛 + 评分卡维度分解\n（BT 评分·胜率·判别性证据）", 340, AMBER),
        ("2 条进入研究计划", "生物膜接合 vs 噬菌体转导\n（判别性实验设计）", 190, RED),
    ]
    y = 460
    for i, (t, s, w, c) in enumerate(stages):
        x = (1150 - w) / 2
        box(ax, x, y, w, 66, "", fc=c, r=7)
        label(ax, 575, y + 45, t, fs=12, color="white", bold=True)
        label(ax, 575, y + 17, s, fs=9, color="#EAF2FF")
        if i < 5:
            arrow(ax, 575, y - 2, 575, y - 24, color=GRAY, lw=2.2)
        y -= 88
    label(ax, 575, 588, "核验—比较—筛选级联（数字来自 2026-08-29 真实 live 运行记录）",
          fs=12.5, color=INK, bold=True)
    save(fig, "fig10_screening.png")


# =====================================================================
# 图11 研究计划生成与可执行性（P11）
# =====================================================================
def fig11():
    fig, ax = new_fig(11.5, 4.7)
    box(ax, 40, 190, 260, 120, "", fc=BLUE, r=9)
    label(ax, 170, 278, "入选假设（≤2 条）", fs=12.5, color="white", bold=True)
    label(ax, 170, 228, "携带预测·证据绑定\n与证伪决策规则", fs=9.5, color="#EAF2FF")
    comps = [
        ("待验证预测", "可观测变量 + 方向 + 阈值"),
        ("数据与实验条件", "数据集/菌株/装置/纳排标准"),
        ("研究步骤与分析方法", "逐步方法 + 失败条件"),
        ("判别性决策规则", "成功/削弱/否定三判据"),
        ("停止·回退·补证条件", "多重检验政策单一权威"),
    ]
    for i, (t, s) in enumerate(comps):
        y = 340 - i * 66
        box(ax, 420, y, 380, 54, "", fc=SKY2, ec=BLUE, lw=1.5, r=6)
        label(ax, 610, y + 36, t, fs=11, color=DEEP, bold=True)
        label(ax, 610, y + 13, s, fs=9, color=GRAY)
        arrow(ax, 304, 250, 416, y + 27, color=BLUE, lw=1.7, alpha=0.8)
    box(ax, 880, 150, 240, 210, "", fc=GREENL, ec=GREEN, lw=1.8, r=9)
    label(ax, 1000, 330, "可执行性检查", fs=12.5, color=GREEN, bold=True)
    label(ax, 1000, 250, "确定性校验器逐项核对\n缺失项列明·结构化警示\n（如实例：自由文本数值\n无预注册锚点 → 标记为\nmodel-stipulated 披露）", fs=9.5, color=INK)
    label(ax, 1000, 96, "杜绝“进一步研究”式空泛表述", fs=10, color=RED, bold=True)
    arrow(ax, 804, 245, 876, 255, color=GREEN, lw=2.4)
    label(ax, 575, 448, "假设 → 研究计划：每个计划要素都能回指其所验证的假设与预测", fs=13, color=INK, bold=True)
    save(fig, "fig11_plan.png")


# =====================================================================
# 图12 完整运行流程与反馈回路（P12）
# =====================================================================
def fig12():
    fig, ax = new_fig(11.5, 5.0)
    # main spine
    main = [("接收科学问题", DEEP), ("证据构建\n（检索·验证·绑定）", BLUE), ("假设生成\n与筛选", CYAN),
            ("研究计划", GREEN), ("实验执行\n（真实数据）", AMBER), ("反馈与修正", RED), ("导出\n可复现包", INK)]
    W, H, gap = 142, 84, 24
    y = 330
    for i, (t, c) in enumerate(main):
        x = 20 + i * (W + gap)
        box(ax, x, y, W, H, t, fc=c, fs=10, r=7)
        if i < len(main) - 1:
            arrow(ax, x + W + 1, y + H / 2, x + W + gap - 1, y + H / 2, color=BORDER, lw=2.2)
    # feedback loops
    # 实验判决 -> 反馈修正 -> 回到假设
    x_hy = 20 + 2 * (W + gap) + W / 2
    x_fb = 20 + 5 * (W + gap) + W / 2
    x_ex = 20 + 4 * (W + gap) + W / 2
    arrow(ax, x_ex, y - 4, x_ex, y - 60, color=RED, lw=2.2, style="-")
    arrow(ax, x_ex, y - 60, x_hy, y - 60, color=RED, lw=2.2, style="-")
    arrow(ax, x_hy, y - 60, x_hy, y - 4, color=RED, lw=2.2)
    label(ax, (x_ex + x_hy) / 2, y - 82, "实验判决（预注册规则机械推导）→ FeedbackSignal → 因果修订 → 版本递增",
          fs=9.5, color=RED, bold=True)
    # human feedback entry
    box(ax, 240, 40, 300, 96, "", fc=AMBERL, ec=AMBER, lw=1.8, r=8)
    label(ax, 390, 112, "研究者反馈 / 直接编辑", fs=11.5, color=AMBER, bold=True)
    label(ax, 390, 72, "与 AI 反馈进入同一条因果修订链\n（前后对比·版本号·陈旧性披露）", fs=9, color=INK)
    arrow(ax, 540, 110, x_hy + 40, y - 4, color=AMBER, lw=2.0, ls=(0, (4, 3)))
    # quality gate re-open
    box(ax, 620, 40, 300, 96, "", fc=SKY2, ec=BLUE, lw=1.8, r=8)
    label(ax, 770, 112, "质量门 / 迭代控制器", fs=11.5, color=BLUE, bold=True)
    label(ax, 770, 72, "有界重开：轮次上限·预算·无实质增量\n三重边界内，全程确定性决策", fs=9, color=INK)
    arrow(ax, 770, 140, x_hy + 120, y - 4, color=BLUE, lw=2.0, ls=(0, (4, 3)))
    label(ax, 575, 478, "一次完整运行：反馈返回到假设生成与计划环节，而非一次性问答", fs=13, color=INK, bold=True)
    save(fig, "fig12_workflow.png")




# =====================================================================
# 图13/14 产品截图标注（PIL 编号圈注）
# =====================================================================
def annotate(src, dst, marks):
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(src).convert("RGB")
    d = ImageDraw.Draw(img)
    try:
        fnt = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 34)
    except Exception:
        fnt = ImageFont.load_default()
    R = 22
    for n, (x, y) in enumerate(marks, 1):
        d.ellipse([x - R - 4, y - R - 4, x + R + 4, y + R + 4], fill="white")
        d.ellipse([x - R, y - R, x + R, y + R], fill="#DC2626")
        d.text((x, y), str(n), font=fnt, fill="white", anchor="mm")
    img.save(dst)
    print("saved", dst)


# =====================================================================
# 图15 评价方法体系（P5）
# =====================================================================
def fig15():
    fig, ax = new_fig(11.5, 4.6)
    layers = [
        ("程序（确定性检查器）", "引用逐字对齐 · 可证伪完整性 · 计划可执行性 ·\n来源解析 · 重复检测 —— 结果可复算", GREEN, GREENL),
        ("模型（辅助评分）", "锦标赛成对比较 · 维度评分 —— 一律标注\nuncalibrated，仅作决策辅助", BLUE, SKY2),
        ("研究者 / 领域专家", "结构化反馈 · 直接编辑 · 盲评抽检 ——\n科学裁决权始终在人", AMBER, AMBERL),
    ]
    for i, (t, s, c, cl) in enumerate(layers):
        y = 300 - i * 100
        box(ax, 30, y, 420, 82, "", fc=cl, ec=c, lw=1.8, r=8)
        label(ax, 240, y + 56, t, fs=12, color=c, bold=True)
        label(ax, 240, y + 24, s, fs=9, color=INK)
    dims = ["相关性", "证据一致性", "可检验性", "可证伪性", "假设多样性", "计划可执行性"]
    for i, d in enumerate(dims):
        x = 520 + (i % 2) * 310
        y = 356 - (i // 2) * 100
        box(ax, x, y, 290, 76, "", fc="white", ec=DEEP, lw=1.6, r=7)
        label(ax, x + 145, y + 50, d, fs=12, color=DEEP, bold=True)
        label(ax, x + 145, y + 20, ["与问题主题重叠度", "主张—来源逐字绑定率", "可观测预测存在性",
                                    "决策规则四字段齐全", "机制聚类区分度", "确定性校验器通过"][i],
              fs=9, color=GRAY)
    label(ax, 575, 440, "三层评价主体 × 六个评价维度：评价结果直接决定继续 / 停止 / 交由研究者",
          fs=13, color=INK, bold=True)
    for i in range(3):
        arrow(ax, 452, 341 - i * 100, 516, 380 - (i % 2) * 0, color=BORDER, lw=1.6, style="-")
    save(fig, "fig15_eval.png")


# =====================================================================
# 图16 W4R 现架构 vs 强基线（P18，真实数字）
# =====================================================================
def fig16():
    import numpy as np
    fig, axes = plt.subplots(1, 4, figsize=(12.2, 3.6), dpi=DPI)
    fig.subplots_adjust(left=0.06, right=0.99, top=0.80, bottom=0.24, wspace=0.45)
    sys_names = ["FAR-Lab", "直接调用", "检索增强"]
    C = [BLUE, RED, GRAY]
    panels = [
        ("引用不受支持率（%）↓", [0, 85.0, 0], "%.0f%%", (0, 100)),
        ("主张—来源绑定率（%）↑", [100, None, None], "%.0f%%", (0, 115)),
        ("结构化反证关系\n（条/运行）↑", [17.3, 0, 0], "%.1f", (0, 21)),
        ("计划可执行通过题数 ↑", [6, 6, 4], "%.0f", (0, 7.5)),
    ]
    for ax, (t, vals, fmt, ylim) in zip(axes, panels):
        xs = np.arange(3)
        for x, v, c in zip(xs, vals, C):
            if v is None:
                ax.bar(x, 0.6, color=c, alpha=0.25, hatch="//", edgecolor="white")
                ax.text(x, ylim[1] * 0.45, "无主张模型\n不可测", ha="center", fontsize=9, color=GRAY)
            else:
                ax.bar(x, v, color=c, width=0.62)
                ax.text(x, v + ylim[1] * 0.02, fmt % v, ha="center", fontsize=10.5,
                        color=INK, weight="bold")
        ax.set_xticks(xs); ax.set_xticklabels(sys_names, fontsize=9)
        ax.set_title(t, fontsize=11.5, color=INK, weight="bold")
        ax.set_ylim(*ylim)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        ax.tick_params(axis="y", labelsize=8.5, colors=GRAY)
    fig.suptitle("同一问题集（6 题）· 同一评判口径 · 全部真实检索与真实模型调用（2026-08-29 预声明协议复测）",
                 fontsize=12.5, color=INK, weight="bold")
    fig.savefig(OUT / "fig16_w4r.png", dpi=DPI, facecolor="white")
    plt.close(fig)
    print("saved fig16_w4r.png")


# =====================================================================
# 图17 MLR-Bench 同裁判对比（P18，真实数字）
# =====================================================================
def fig17():
    import numpy as np
    fig, ax = plt.subplots(figsize=(9.8, 3.9), dpi=DPI)
    fig.subplots_adjust(left=0.07, right=0.98, top=0.74, bottom=0.14)
    dims = ["idea（创意质量）", "proposal（方案质量）"]
    data = {"FAR-Lab": [7.00, 6.20], "o4-mini": [7.80, 7.40], "deepseek-r1": [7.60, 7.00]}
    colors = {"FAR-Lab": BLUE, "o4-mini": GRAY, "deepseek-r1": "#94A3B8"}
    x = np.arange(2); w = 0.26
    for i, (k, v) in enumerate(data.items()):
        b = ax.bar(x + (i - 1) * w, v, w, label=k, color=colors[k])
        for r, val in zip(b, v):
            ax.text(r.get_x() + r.get_width() / 2, val + 0.06, f"{val:.2f}", ha="center",
                    fontsize=10, weight="bold", color=INK)
    ax.set_xticks(x); ax.set_xticklabels(dims, fontsize=11.5)
    ax.set_ylim(0, 9.2); ax.set_ylabel("裁判评分（0–10）", fontsize=10.5)
    ax.legend(fontsize=10, ncol=3, frameon=False, loc="lower center", bbox_to_anchor=(0.5, 0.99))
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.set_title("MLR-Bench 同裁判对比（N=5 任务；另：可行性维度 FAR-Lab 7.40，高于两个锚点系统）",
                 fontsize=11.5, color=INK, weight="bold", pad=34)
    fig.savefig(OUT / "fig17_mlrbench.png", dpi=DPI, facecolor="white")
    plt.close(fig)
    print("saved fig17_mlrbench.png")


# =====================================================================
# 图18 判官重校与反证能力进步（P19，真实数字）
# =====================================================================
def fig18():
    import numpy as np
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.2, 3.7), dpi=DPI,
                                   gridspec_kw={"width_ratios": [1.15, 1]})
    fig.subplots_adjust(left=0.06, right=0.985, top=0.78, bottom=0.20, wspace=0.3)
    # (a) rediscovery recalibration timeline
    xs = [0, 1, 2]
    vals = [0.58, 0.03, 0.226]
    labs = ["2026-08-22 初报 0.58\n（后经查证为评判模型宽松）", "对照实验\n差异全部来自评判模型栈", "v2.2 重校后实测 0.226\n（157 对 gold 零误差定阈）"]
    ax1.plot(xs, vals, "-o", color=BLUE, lw=2.5, markersize=9, markerfacecolor="white",
             markeredgewidth=2.5)
    for x, v, l in zip(xs, vals, labs):
        off = (0, -52) if x == 0 else (0, 16)
        ax1.annotate(l, (x, v), textcoords="offset points", xytext=off, ha="center",
                     fontsize=8.8, color=INK)
    ax1.axhline(0.7, color=GREEN, ls="--", lw=1.5)
    ax1.text(2.05, 0.7, "目标 0.7", fontsize=9, color=GREEN, va="center")
    ax1.set_xlim(-0.3, 2.75); ax1.set_ylim(0, 0.95)
    ax1.set_xticks(xs); ax1.set_xticklabels(["初报", "归因实验", "重校复测"], fontsize=10)
    ax1.set_title("重发现指标 F1 的校准复测（不通过改指标恢复数字）", fontsize=11.5,
                  color=INK, weight="bold")
    ax1.tick_params(axis="y", labelsize=9, colors=GRAY)
    for s in ("top", "right"):
        ax1.spines[s].set_visible(False)
    # (b) counter-evidence capability before/after
    cats = ["严格关系精度\nstrict", "反证实质命中\nsubstantive-hit", "反向标签错误\ninverted（个）"]
    before = [0.625, 0.143, 9]
    after = [0.875, 0.875, 3]
    x = np.arange(3); w = 0.34
    b1 = ax2.bar(x - w / 2, before, w, label="修复前（2026-08-22 前）", color=GRAY)
    b2 = ax2.bar(x + w / 2, after, w, label="修复后 live 实测", color=CYAN)
    for r, v in zip(b1, before):
        ax2.text(r.get_x() + w / 2, v + 0.15, f"{v:g}", ha="center", fontsize=9.5, color=INK)
    for r, v in zip(b2, after):
        ax2.text(r.get_x() + w / 2, v + 0.15, f"{v:g}", ha="center", fontsize=9.5,
                 weight="bold", color=INK)
    ax2.set_xticks(x); ax2.set_xticklabels(cats, fontsize=9.5)
    ax2.set_ylim(0, 10.5)
    ax2.set_title("反证能力：标签纪律 + 主题门修复前后（live 对比）", fontsize=11.5,
                  color=INK, weight="bold")
    ax2.legend(fontsize=9, frameon=False, loc="upper center")
    ax2.tick_params(axis="y", labelsize=9, colors=GRAY)
    for s in ("top", "right"):
        ax2.spines[s].set_visible(False)
    fig.savefig(OUT / "fig18_reccal.png", dpi=DPI, facecolor="white")
    plt.close(fig)
    print("saved fig18_reccal.png")


# =====================================================================
# 图19 可复现包与独立验证（P20，真实数字）
# =====================================================================
def fig19():
    fig, ax = new_fig(11.5, 4.4)
    box(ax, 30, 140, 300, 220, "", fc=SKY2, ec=BLUE, lw=1.8, r=9)
    label(ax, 180, 332, "可复现包（bundle）", fs=12.5, color=DEEP, bold=True)
    label(ax, 180, 245, "问题与约束 · 全部对象\n来源不可变快照 · 收据账本\nIMRaD 论文投影 · BibTeX\n（仅来自存储元数据）", fs=10, color=INK)
    box(ax, 430, 140, 330, 220, "", fc="white", ec=CYAN, lw=1.8, r=9)
    label(ax, 595, 332, "far verify 独立校验", fs=12.5, color=CYAN, bold=True)
    label(ax, 595, 240, "内容哈希逐一重算\n收据链完整性核对\n引用可解析性探测\n模板内容零容忍检查\n图表引用哈希探测（共 14+ 项）", fs=10, color=INK)
    arrow(ax, 334, 250, 424, 250, color=BORDER, lw=2.6)
    # results
    res = [("情景 A（FEM 自适应）", "15/15 通过 · 120 张 live 收据", GREEN),
           ("情景 B（桥接运行）", "15/15 通过", GREEN),
           ("情景 B（管线原生）", "16/16 通过", GREEN)]
    for i, (t, s, c) in enumerate(res):
        y = 300 - i * 86
        box(ax, 830, y, 300, 70, "", fc=GREENL, ec=c, lw=1.8, r=8)
        label(ax, 980, y + 46, t, fs=10.5, color=INK, bold=True)
        label(ax, 980, y + 18, s, fs=10, color=c, bold=True)
        ax.text(848, y + 35, "✓", fontsize=20, color=c, weight="bold", ha="center", va="center")
    arrow(ax, 764, 250, 826, 250, color=GREEN, lw=2.6)
    label(ax, 575, 412, "导出即证据：第三方可用 far verify 独立重算全部校验", fs=13, color=INK, bold=True)
    save(fig, "fig19_verify.png")


# =====================================================================
# 图20 证伪—修订因果链（P14 案例，真实记录）
# =====================================================================
def fig20():
    fig, ax = new_fig(11.5, 4.6)
    chain = [
        ("假设 v0", "「iris 物种不可\n线性分离」\n（刻意可证伪方向）", DEEP),
        ("实验执行", "OpenML iris (id 61)\nsklearn 真实训练\n观测 accuracy=0.6", CYAN),
        ("机械判决", "预注册决策规则推导\nverdict = falsifies", RED),
        ("反馈信号", "FeedbackSignal\nfbk_ayear4kr…", AMBER),
        ("因果修订", "Revision rev_62hfj5…\ncausalReason 可追溯", BLUE),
        ("假设 v1", "「可线性分离」\n6 字段 VersionDiff\nqualityDelta=improved", GREEN),
    ]
    W, H, gap = 168, 130, 22
    y = 210
    for i, (t, s, c) in enumerate(chain):
        x = 15 + i * (W + gap)
        box(ax, x, y, W, H, "", fc="white", ec=c, lw=2.0, r=8)
        ax.add_patch(Rectangle((x, y + H - 34), W, 34, fc=c, ec="none"))
        label(ax, x + W / 2, y + H - 17, t, fs=11, color="white", bold=True)
        label(ax, x + W / 2, y + 44, s, fs=8.8, color=INK)
        if i < 5:
            arrow(ax, x + W + 1, y + H / 2, x + W + gap - 1, y + H / 2, color=GRAY, lw=2.2)
    label(ax, 575, 410, "真实记录：实验判决如何因果地改写假设（2026-08-22 真实 live 运行）",
          fs=12.5, color=INK, bold=True)
    label(ax, 575, 130, "关键性质：判决不由 LLM 做出（预注册统计规则机械推导）；修订与触发反馈一一对应；\n修订前后版本对比持久化并随导出包供第三方复核",
          fs=10.5, color=GRAY)
    # version diff chips
    for i, f in enumerate(["statement", "mechanism", "assumptions", "predictions", "uncertainties", "version"]):
        pill(ax, 170 + i * 140, 30, 128, 40, f, GREENL, GREEN, fs=9.5)
    save(fig, "fig20_case_iris.png")


fig01(); fig02(); fig03(); fig04(); fig05()
fig06(); fig07(); fig08(); fig09(); fig10(); fig11(); fig12()
fig15(); fig16(); fig17(); fig18(); fig19(); fig20()

ROOT = Path(__file__).resolve().parents[3]
annotate(ROOT / "evidence/hx/g12-visual-2026-08-27/step4-map-completed.png",
         OUT / "fig13_ui_map.png",
         [(240, 110), (232, 200), (222, 330), (240, 428)])
annotate(ROOT / "evidence/hx/g12-visual-2026-08-27/step5-hypothesis-inspector.png",
         OUT / "fig14_ui_inspector.png",
         [(330, 370), (1005, 30), (1005, 390), (232, 705)])
print("ALL DONE")
