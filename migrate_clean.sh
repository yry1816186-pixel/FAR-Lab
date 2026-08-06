#!/usr/bin/env bash
# ============================================================
# FAR-Lab migrate_clean.sh — 第二轮增量治理（2026-08-07）
# 依据: AUDIT_REPORT.md（全量物理扫描 + git 跟踪状态交叉验证）
# 模式: 默认 DRY-RUN（仅打印动作不执行）→ 确认后加 --apply
# 铁律:
#   1. 白名单移动 —— 本轮 src/ 与 tests/ 零移动（第一轮已达成模块化蓝图）
#   2. 测试隔离 —— tests/ 已按模块划分，强行拆 unit/integration 破坏 2023 测试 import 图
#   3. 无情删除（带备份）—— 所有删除经 .trash_backup/ 中转，可人工复核
#   4. 文档归档 —— 本轮不移动任何 .md（docs/far-lab-reboot/drafts 被 8+ 引用链绑定）
#   保护清单: 47 staged + 45 modified + 12 untracked 功能文件 绝不触碰
# ============================================================
set -euo pipefail

DRY_RUN=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=0
fi

TRASH=".trash_backup"
TS=$(date +%Y%m%d_%H%M%S)
TRASH_DIR="${TRASH}/migrated_${TS}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ACTION]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
skip() { echo -e "${YELLOW}[SKIP]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo -e "${GREEN}[DRY-RUN]${NC} $*"
  else
    log "$@"
    eval "$@"
  fi
}

echo "=============================================================="
echo " FAR-Lab migrate_clean.sh — 第二轮增量治理"
echo " 模式: $([[ $DRY_RUN -eq 1 ]] && echo 'DRY-RUN (仅预览)' || echo 'APPLY (实际执行)')"
echo "=============================================================="

# ---------------------------------------------------------------
# Phase 0: 前置检查
# ---------------------------------------------------------------
if [[ ! -d ".git" ]]; then err "必须在 FAR-Lab/ 仓库根目录运行"; exit 1; fi

# 保护断言: 记录 src/ + tests/ 当前 git 状态指纹，执行后必须一致
PROTECT_FINGERPRINT=$(git status --porcelain src/ tests/ | wc -l)
log "Phase 0: 保护断言 — src/+tests/ 当前变更指纹: ${PROTECT_FINGERPRINT} 行（执行后必须不变）"

# ---------------------------------------------------------------
# Phase 1: 备份目录创建（铁律 3：先备份再删）
# ---------------------------------------------------------------
log "Phase 1: 创建备份目录 ${TRASH_DIR}"
run "mkdir -p \"${TRASH_DIR}\""

# ---------------------------------------------------------------
# Phase 2: C 类物理清理 — NODE_COMPILE_CACHE 泄漏 (0/ 目录, 22MB)
# ---------------------------------------------------------------
log "Phase 2: 清理 NODE_COMPILE_CACHE 泄漏 (0/) — git 已 ignore，仅物理回收"
if [[ -d "0" ]]; then
  run "mv 0 \"${TRASH_DIR}/node_compile_cache_0\""
else
  skip "0/ 不存在（已清理过）"
fi

# ---------------------------------------------------------------
# Phase 3: C 类物理清理 — .ruff_cache (Python lint 缓存)
# ---------------------------------------------------------------
log "Phase 3: 清理 .ruff_cache/ — git 已 ignore，仅物理回收"
if [[ -d ".ruff_cache" ]]; then
  run "mv .ruff_cache \"${TRASH_DIR}/ruff_cache\""
else
  skip ".ruff_cache/ 不存在（已清理过）"
fi

# ---------------------------------------------------------------
# Phase 4: 被追踪日志 untrack + 归档（P0-1: 9 个 .log 进过版本库）
# 安全序列（吸取 pre-release-hygiene Pitfall #10 教训）:
#   先物理 mv 走 → 再 git rm --cached 摘索引（避免 'has local modifications' 拒绝）
# ---------------------------------------------------------------
log "Phase 4: untrack .far-release/gates/*.log (8 个) + installer log (1 个)"
GATE_LOGS=(
  ".far-release/gates/checksums.log"
  ".far-release/gates/design_lint.log"
  ".far-release/gates/eslint.log"
  ".far-release/gates/fitness.log"
  ".far-release/gates/gate_c.log"
  ".far-release/gates/gate_d.log"
  ".far-release/gates/tsc.log"
  ".far-release/gates/zero_tolerance.log"
  ".far-release/installer_clean_machine.log"
)
run "mkdir -p \"${TRASH_DIR}/release_gate_logs\""
for f in "${GATE_LOGS[@]}"; do
  if [[ -f "$f" ]]; then
    run "mv \"$f\" \"${TRASH_DIR}/release_gate_logs/\""
    run "git rm --cached --ignore-unmatch \"$f\""
  else
    skip "$f 不存在"
  fi
done

# ---------------------------------------------------------------
# Phase 5: .gitignore 缺口补齐（幂等：已存在则跳过）
# 蓝图强制条目: .trash_backup/ · *-agent-*/ · *.tmp · *.cache · 全局 *.log
# 豁免: tests/fixtures/**（tic_sample.cache 被 5 处代码引用，是测试输入）
# ---------------------------------------------------------------
log "Phase 5: 追加 .gitignore 缺口条目（幂等）"
GITIGNORE_APPEND=(
  ""
  "# --- 2026-08-07 第二轮治理追加（蓝图强制条目） ---"
  "# 备份/回收目录（migrate_clean.sh 的 .trash_backup 中转区）"
  ".trash_backup/"
  "# 通配 AI 助手临时目录"
  "*-agent-*/"
  "# 临时文件与通用缓存"
  "*.tmp"
  "*.cache"
  "# 全局日志（门禁运行日志不再入库）"
  "*.log"
  "!tests/fixtures/**/*.cache"
  "!tests/fixtures/**/*.log"
  "!docs/archive/**/*.log"
  "!docs/audits/**/*.log"
  "# 评审记录过程日志（归档证据保留物理，防误提交）"
  "**/评审记录/**/*.log"
)
for line in "${GITIGNORE_APPEND[@]}"; do
  if [[ -n "$line" && "$line" != \#* ]]; then
    if grep -qF -- "$line" .gitignore; then
      skip "已存在: $line"
    else
      run "printf '%s\n' \"$line\" >> .gitignore"
    fi
  fi
done

# ---------------------------------------------------------------
# Phase 6: 保护断言复核 + 汇总
# ---------------------------------------------------------------
NEW_FINGERPRINT=$(git status --porcelain src/ tests/ | wc -l)
log "Phase 6: 保护断言复核 — src/+tests/ 变更指纹: ${NEW_FINGERPRINT} 行"
if [[ "$PROTECT_FINGERPRINT" != "$NEW_FINGERPRINT" ]]; then
  err "保护断言失败！src/+tests/ 被意外改动 (${PROTECT_FINGERPRINT} → ${NEW_FINGERPRINT})。立即检查 .trash_backup/ 并回滚。"
  exit 1
fi

echo ""
echo "=============================================================="
if [[ $DRY_RUN -eq 1 ]]; then
  echo " DRY-RUN 完成 — 以上均为预览动作，未改动任何文件"
  echo " 确认执行: bash migrate_clean.sh --apply"
  echo " 预计回收: ~23MB 物理 + 9 个日志索引项"
  echo " 预计 .gitignore 追加: 10 条"
else
  echo " APPLY 完成 — 已备份至 ${TRASH_DIR}/"
  echo " 人工复核: 确认 .trash_backup/ 内容无误后删除"
  echo " 下一步: git status 查看 untrack 结果（严禁立即提交）"
  echo " 注: src/+tests/ 保护断言通过，功能 staged 变更未受影响"
fi
echo "=============================================================="
