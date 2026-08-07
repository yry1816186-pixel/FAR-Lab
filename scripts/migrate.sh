#!/usr/bin/env bash
# FAR-Lab 治理迁移脚本 (Linux / macOS / git-bash on Windows)
# 生成时间: 2026-08-07 · 依据: docs/audits/PROJECT_CLEANLINESS_AUDIT_2026-08-07.md
# 模式: 默认 DRY-RUN（仅打印动作，不执行）。确认后加 --apply 实际执行。

set -euo pipefail

DRY_RUN=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=0
fi

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${GREEN}[ACTION]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
skip() { echo -e "${YELLOW}[SKIP]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

# 安全执行封装：dry-run 时仅打印，apply 时实际执行
run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo -e "${GREEN}[DRY-RUN]${NC} $*"
  else
    log "$@"
    eval "$@"
  fi
}

# 冲突处理：若目标存在，归档到 docs/archive/migrated_<timestamp>/ 而非覆盖
archive_if_conflict() {
  local target="$1"
  if [[ -e "$target" ]]; then
    local ts=$(date +%Y%m%d_%H%M%S)
    local archive_dir="docs/archive/migrated_${ts}"
    warn "Conflict detected: $target already exists. Archiving to $archive_dir/"
    run "mkdir -p \"$archive_dir\""
    run "mv \"$target\" \"$archive_dir/\""
  fi
}

echo "=============================================================="
echo " FAR-Lab 治理迁移脚本"
echo " 模式: $([[ $DRY_RUN -eq 1 ]] && echo 'DRY-RUN (仅预览)' || echo 'APPLY (实际执行)')"
echo "=============================================================="
echo ""

# --------------------------------------------------------------
# Phase 0: 前置检查
# --------------------------------------------------------------
log "Phase 0: 前置检查"

if [[ ! -d ".git" ]]; then
  err "当前目录不是 git 仓库根。请在 FAR-Lab/ 下运行。"
  exit 1
fi

# 检查是否有未提交的暂存删除（896 项），若有则警告
STAGED_DELETIONS=$(git status --porcelain | grep -c '^D' || true)
if [[ $STAGED_DELETIONS -gt 0 ]]; then
  warn "检测到 $STAGED_DELETIONS 个暂存删除（主要来自 .far-implementation/adversarial/raw/ 清理）。"
  warn "建议先执行: git add -A && git commit -m 'chore: purge adversarial raw artifacts' 落地清理，再运行本脚本。"
  warn "或者在运行本脚本前手动处理这些暂存变更。"
  if [[ $DRY_RUN -eq 0 ]]; then
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      err "用户中止。请先处理暂存删除。"
      exit 1
    fi
  fi
fi

# --------------------------------------------------------------
# Phase 1: P0 风险修复 — 追踪 docs/learning/
# --------------------------------------------------------------
log "Phase 1: P0 风险修复 — 追踪 docs/learning/ (13 章教学脊柱)"

if [[ -d "docs/learning" ]]; then
  TRACKED_COUNT=$(git ls-files docs/learning | wc -l)
  if [[ $TRACKED_COUNT -eq 0 ]]; then
    log "docs/learning/ 当前 0% 被追踪，正在 add..."
    run "git add docs/learning/"
    if [[ $DRY_RUN -eq 1 ]]; then
      log "将 add docs/learning/（执行后请 commit: git commit -m 'feat(docs): track learning path (13 chapters)'）"
    else
      log "已 add docs/learning/。请记得 commit: git commit -m 'feat(docs): track learning path (13 chapters)'"
    fi
  else
    skip "docs/learning/ 已有 $TRACKED_COUNT 个文件被追踪，跳过。"
  fi
else
  warn "docs/learning/ 目录不存在，跳过。"
fi

# --------------------------------------------------------------
# Phase 2: 物理删除 C 类残留（全部已在 .gitignore，删除安全）
# --------------------------------------------------------------
log "Phase 2: 物理删除 C 类残留（已在 .gitignore，未追踪）"

C_PATHS=(
  "0"                          # NODE_COMPILE_CACHE 泄漏 (3,209 文件 / 17.9MB)
  "frontend/0"                 # 前端 NODE_COMPILE_CACHE 泄漏 (1,017 文件 / ~1MB)
  ".pi/state"                  # Pi 代理本地状态 (~60 文件)
  ".pi/baseline-logs"          # Pi 历史门禁日志 (19 文件)
  "repro/science_harness/__pycache__"
  "repro/tests/__pycache__"
  ".benchmarks"                # vitest benchmark 缓存（空目录）
  ".agent-state"               # 本地会话状态（1 文件，已被 .gitignore 覆盖）
)

for path in "${C_PATHS[@]}"; do
  if [[ -e "$path" ]]; then
    run "rm -rf \"$path\""
  else
    skip "不存在: $path"
  fi
done

# --------------------------------------------------------------
# Phase 3: 删除 D 类重复文档
# --------------------------------------------------------------
log "Phase 3: 删除 D 类重复文档"

# G1: API 参考双轨 — 保留小写 api-reference.md（INDEX.md 引用），删除大写 API_REFERENCE.md
if [[ -f "docs/API_REFERENCE.md" && -f "docs/api-reference.md" ]]; then
  log "G1: 检测到 API 参考双轨。归档大写版本后删除。"
  archive_if_conflict "docs/archive/API_REFERENCE.md"
  run "mv docs/API_REFERENCE.md docs/archive/API_REFERENCE.md"
  run "git rm --cached docs/API_REFERENCE.md 2>/dev/null || true"
else
  skip "G1: API 参考双轨不存在或已处理。"
fi

# G2: 竞争分析双轨 — 保留 22K 完整版，删除 6.5K 精简版（或改为摘要）
if [[ -f "docs/COMPETITIVE_ANALYSIS.md" && -f "docs/competitive-analysis-report.md" ]]; then
  log "G2: 检测到竞争分析双轨。归档精简版后删除。"
  archive_if_conflict "docs/archive/COMPETITIVE_ANALYSIS.md"
  run "mv docs/COMPETITIVE_ANALYSIS.md docs/archive/COMPETITIVE_ANALYSIS.md"
  run "git rm --cached docs/COMPETITIVE_ANALYSIS.md 2>/dev/null || true"
else
  skip "G2: 竞争分析双轨不存在或已处理。"
fi

# G3: ULTIMATE_DESIGN.md 孤儿 — 归档到 docs/design/ 并在 INDEX.md 加索引（需手动）
if [[ -f "docs/ULTIMATE_DESIGN.md" ]]; then
  log "G3: 检测到 ULTIMATE_DESIGN.md 孤儿文档。归档到 docs/design/。"
  archive_if_conflict "docs/design/ULTIMATE_DESIGN.md"
  run "mv docs/ULTIMATE_DESIGN.md docs/design/ULTIMATE_DESIGN.md"
  run "git rm --cached docs/ULTIMATE_DESIGN.md 2>/dev/null || true"
  warn "请手动在 docs/INDEX.md 的 'Design documentation' 小节加一行: [ULTIMATE_DESIGN.md](design/ULTIMATE_DESIGN.md)"
else
  skip "G3: ULTIMATE_DESIGN.md 不存在或已处理。"
fi

# G4: jsdoc 审计残留 — 删除已被 REFRESHED 收口的 5 个历史批次文件
JSDOC_STALE=(
  "docs/audits/jsdoc_missing_batch1.txt"
  "docs/audits/jsdoc_missing_batch2.txt"
  "docs/audits/jsdoc_missing_batch3.txt"
  "docs/audits/jsdoc_missing_batch4.txt"
  "docs/audits/jsdoc_missing_CORE.txt"
)
for f in "${JSDOC_STALE[@]}"; do
  if [[ -f "$f" ]]; then
    log "G4: 删除 jsdoc 审计残留: $f"
    run "rm -f \"$f\""
    run "git rm --cached \"$f\" 2>/dev/null || true"
  fi
done

# --------------------------------------------------------------
# Phase 4: 删除漏网临时脚本与冗余文件
# --------------------------------------------------------------
log "Phase 4: 删除漏网临时脚本与冗余文件"

STALE_SCRIPTS=(
  "docs/archive/agent-materials/_apply_jsdoc_batch3.py"
  "docs/archive/agent-materials/_jsdoc_helper.py"
  "docs/archive/agent-materials/tmp_insert_jsdoc.py"
  ".gitignore.agent-config"  # 内容已并入 .gitignore 第 140-144 行
)
for f in "${STALE_SCRIPTS[@]}"; do
  if [[ -f "$f" ]]; then
    log "删除: $f"
    run "rm -f \"$f\""
    run "git rm --cached \"$f\" 2>/dev/null || true"
  fi
done

# --------------------------------------------------------------
# Phase 5: 强化 .gitignore（防御未来污染）
# --------------------------------------------------------------
log "Phase 5: 强化 .gitignore（追加防御规则）"

GITIGNORE_ADD='''
# --- 2026-08-07 治理追加：防御未来污染 ---
# 全局忽略任何 NODE_COMPILE_CACHE 泄漏（不限于根目录）
**/0/v[0-9]*-x[0-9]*/
# Python 缓存（全局，含子目录）
**/__pycache__/
# 本地会话与代理状态（防止未来新增工具泄漏）
.agent-state/
.pi/state/
.pi/baseline-logs/
# 对抗过程产物全目录（追踪清理后防止重新入库；REPORT.md 等证据随 git 历史保留）
.far-implementation/adversarial/
# 临时脚本与审计残留
**/_*.py
**/tmp_*.py
**/jsdoc_missing_batch*.txt
'''

if [[ $DRY_RUN -eq 0 ]]; then
  if ! grep -q '2026-08-07 治理追加' .gitignore; then
    echo "$GITIGNORE_ADD" >> .gitignore
    log "已追加防御规则到 .gitignore"
  else
    skip ".gitignore 已包含 2026-08-07 治理规则。"
  fi
else
  echo -e "${GREEN}[DRY-RUN]${NC} 将追加以下内容到 .gitignore:"
  echo "$GITIGNORE_ADD"
fi

# --------------------------------------------------------------
# Phase 6: 生成新的目录结构预览
# --------------------------------------------------------------
log "Phase 6: 生成新的目录结构预览 (tree.txt)"

if [[ $DRY_RUN -eq 0 ]]; then
  # 排除依赖环境与 .git
  find . -path ./.git -prune -o -path ./node_modules -prune -o -path ./.venv -prune -o -path ./frontend/node_modules -prune -o -type f -print | sort > tree.txt
  log "已生成 tree.txt ($(wc -l < tree.txt) 文件)"
else
  echo -e "${GREEN}[DRY-RUN]${NC} 将生成 tree.txt（排除 .git/node_modules/.venv/frontend/node_modules）"
fi

# --------------------------------------------------------------
# 完成
# --------------------------------------------------------------
echo ""
echo "=============================================================="
if [[ $DRY_RUN -eq 1 ]]; then
  echo " DRY-RUN 完成。以上为预览动作，未实际执行。"
  echo " 确认无误后，运行: bash migrate.sh --apply"
else
  echo " APPLY 完成。请执行以下后续动作:"
  echo "   1. git add -A"
  echo "   2. git commit -m 'chore: governance cleanup (see PROJECT_CLEANLINESS_AUDIT_2026-08-07.md)'"
  echo "   3. 手动更新 docs/INDEX.md 为 ULTIMATE_DESIGN.md 加索引（见 Phase 3 G3）"
fi
echo "=============================================================="
