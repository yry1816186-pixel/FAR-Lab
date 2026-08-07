# FAR-Lab 治理迁移脚本 (Windows PowerShell)
# 生成时间: 2026-08-07 · 依据: docs/audits/PROJECT_CLEANLINESS_AUDIT_2026-08-07.md
# 模式: 默认 DRY-RUN（仅打印动作，不执行）。确认后加 -Apply 实际执行。
# 用法:  powershell -ExecutionPolicy Bypass -File migrate.ps1          # dry-run
#        powershell -ExecutionPolicy Bypass -File migrate.ps1 -Apply   # 实际执行

param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$DRY_RUN = -not $Apply

function Log   { Write-Host "[ACTION] $args" -ForegroundColor Green }
function Warn  { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Skip  { Write-Host "[SKIP] $args" -ForegroundColor Yellow }
function Err   { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 安全执行封装：dry-run 时仅打印，apply 时实际执行
function Run([string]$Cmd) {
    if ($DRY_RUN) {
        Write-Host "[DRY-RUN] $Cmd" -ForegroundColor Green
    } else {
        Log $Cmd
        Invoke-Expression $Cmd
    }
}

# 冲突处理：若目标存在，归档到 docs/archive/migrated_<timestamp>/ 而非覆盖
function Archive-If-Conflict([string]$Target) {
    if (Test-Path $Target) {
        $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
        $archiveDir = "docs/archive/migrated_$ts"
        Warn "Conflict detected: $Target already exists. Archiving to $archiveDir/"
        Run "New-Item -ItemType Directory -Force -Path '$archiveDir' | Out-Null"
        Run "Move-Item -Force '$Target' '$archiveDir/'"
    }
}

Write-Host "=============================================================="
if ($DRY_RUN) { Write-Host " FAR-Lab 治理迁移脚本 — DRY-RUN 模式 (仅预览)" }
else          { Write-Host " FAR-Lab 治理迁移脚本 — APPLY 模式 (实际执行)" }
Write-Host "=============================================================="
Write-Host ""

# --------------------------------------------------------------
# Phase 0: 前置检查
# --------------------------------------------------------------
Log "Phase 0: 前置检查"
if (-not (Test-Path '.git')) {
    Err "当前目录不是 git 仓库根。请在 FAR-Lab/ 下运行。"
    exit 1
}

# 检查是否有未提交的暂存删除
$staged = (git status --porcelain | Select-String '^D' | Measure-Object).Count
if ($staged -gt 0) {
    Warn "检测到 $staged 个暂存删除（主要来自 .far-implementation/adversarial/raw/ 清理）。"
    Warn "建议先执行: git add -A && git commit -m 'chore: purge adversarial raw artifacts' 落地清理。"
    if (-not $DRY_RUN) {
        $answer = Read-Host "是否继续? (y/N)"
        if ($answer -notmatch '^[Yy]') {
            Err "用户中止。请先处理暂存删除。"
            exit 1
        }
    }
}

# --------------------------------------------------------------
# Phase 1: P0 风险修复 — 追踪 docs/learning/
# --------------------------------------------------------------
Log "Phase 1: P0 风险修复 — 追踪 docs/learning/ (13 章教学脊柱)"
if (Test-Path 'docs/learning') {
    $tracked = (git ls-files docs/learning | Measure-Object).Count
    if ($tracked -eq 0) {
        Log "docs/learning/ 当前 0% 被追踪，正在 add..."
        Run "git add docs/learning/"
        if ($DRY_RUN) {
            Log "将 add docs/learning/（执行后请 commit: git commit -m 'feat(docs): track learning path (13 chapters)'）"
        } else {
            Log "已 add docs/learning/。请记得 commit: git commit -m 'feat(docs): track learning path (13 chapters)'"
        }
    } else {
        Skip "docs/learning/ 已有 $tracked 个文件被追踪，跳过。"
    }
} else {
    Warn "docs/learning/ 目录不存在，跳过。"
}

# --------------------------------------------------------------
# Phase 2: 物理删除 C 类残留（全部已在 .gitignore，删除安全）
# --------------------------------------------------------------
Log "Phase 2: 物理删除 C 类残留（已在 .gitignore，未追踪）"
$CPaths = @(
    "0",                          # NODE_COMPILE_CACHE 泄漏 (3,209 文件 / 17.9MB)
    "frontend/0",                 # 前端 NODE_COMPILE_CACHE 泄漏 (1,017 文件 / ~1MB)
    ".pi/state",                  # Pi 代理本地状态 (~60 文件)
    ".pi/baseline-logs",          # Pi 历史门禁日志 (19 文件)
    "repro/science_harness/__pycache__",
    "repro/tests/__pycache__",
    ".benchmarks",                # vitest benchmark 缓存（空目录）
    ".agent-state"                # 本地会话状态（1 文件，已被 .gitignore 覆盖）
)
foreach ($path in $CPaths) {
    if (Test-Path $path) {
        Run "Remove-Item -Recurse -Force '$path'"
    } else {
        Skip "不存在: $path"
    }
}

# --------------------------------------------------------------
# Phase 3: 删除 D 类重复文档
# --------------------------------------------------------------
Log "Phase 3: 删除 D 类重复文档"

# G1: API 参考双轨 — 保留小写 api-reference.md，归档大写版本
if ((Test-Path 'docs/API_REFERENCE.md') -and (Test-Path 'docs/api-reference.md')) {
    Log "G1: 检测到 API 参考双轨。归档大写版本后删除。"
    Archive-If-Conflict 'docs/archive/API_REFERENCE.md'
    Run "Move-Item -Force 'docs/API_REFERENCE.md' 'docs/archive/API_REFERENCE.md'"
    Run "git rm --cached docs/API_REFERENCE.md 2>`$null"
} else {
    Skip "G1: API 参考双轨不存在或已处理。"
}

# G2: 竞争分析双轨 — 保留 22K 完整版，归档精简版
if ((Test-Path 'docs/COMPETITIVE_ANALYSIS.md') -and (Test-Path 'docs/competitive-analysis-report.md')) {
    Log "G2: 检测到竞争分析双轨。归档精简版后删除。"
    Archive-If-Conflict 'docs/archive/COMPETITIVE_ANALYSIS.md'
    Run "Move-Item -Force 'docs/COMPETITIVE_ANALYSIS.md' 'docs/archive/COMPETITIVE_ANALYSIS.md'"
    Run "git rm --cached docs/COMPETITIVE_ANALYSIS.md 2>`$null"
} else {
    Skip "G2: 竞争分析双轨不存在或已处理。"
}

# G3: ULTIMATE_DESIGN.md 孤儿 — 归档到 docs/design/
if (Test-Path 'docs/ULTIMATE_DESIGN.md') {
    Log "G3: 检测到 ULTIMATE_DESIGN.md 孤儿文档。归档到 docs/design/。"
    Archive-If-Conflict 'docs/design/ULTIMATE_DESIGN.md'
    Run "Move-Item -Force 'docs/ULTIMATE_DESIGN.md' 'docs/design/ULTIMATE_DESIGN.md'"
    Run "git rm --cached docs/ULTIMATE_DESIGN.md 2>`$null"
    Warn "请手动在 docs/INDEX.md 的 'Design documentation' 小节加一行: [ULTIMATE_DESIGN.md](design/ULTIMATE_DESIGN.md)"
} else {
    Skip "G3: ULTIMATE_DESIGN.md 不存在或已处理。"
}

# G4: jsdoc 审计残留 — 删除已被 REFRESHED 收口的 5 个历史批次文件
$JsdocStale = @(
    "docs/audits/jsdoc_missing_batch1.txt"
    "docs/audits/jsdoc_missing_batch2.txt"
    "docs/audits/jsdoc_missing_batch3.txt"
    "docs/audits/jsdoc_missing_batch4.txt"
    "docs/audits/jsdoc_missing_CORE.txt"
)
foreach ($f in $JsdocStale) {
    if (Test-Path $f) {
        Log "G4: 删除 jsdoc 审计残留: $f"
        Run "Remove-Item -Force '$f'"
        Run "git rm --cached '$f' 2>`$null"
    }
}

# --------------------------------------------------------------
# Phase 4: 删除漏网临时脚本与冗余文件
# --------------------------------------------------------------
Log "Phase 4: 删除漏网临时脚本与冗余文件"
$StaleScripts = @(
    "docs/archive/agent-materials/_apply_jsdoc_batch3.py"
    "docs/archive/agent-materials/_jsdoc_helper.py"
    "docs/archive/agent-materials/tmp_insert_jsdoc.py"
    ".gitignore.agent-config"  # 内容已并入 .gitignore 第 140-144 行
)
foreach ($f in $StaleScripts) {
    if (Test-Path $f) {
        Log "删除: $f"
        Run "Remove-Item -Force '$f'"
        Run "git rm --cached '$f' 2>`$null"
    }
}

# --------------------------------------------------------------
# Phase 5: 强化 .gitignore（防御未来污染）
# --------------------------------------------------------------
Log "Phase 5: 强化 .gitignore（追加防御规则）"
$GitignoreAdd = @"

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
"@

if (-not $DRY_RUN) {
    if (-not (Select-String -Path .gitignore -Pattern '2026-08-07 治理追加' -Quiet)) {
        Add-Content -Path .gitignore -Value $GitignoreAdd
        Log "已追加防御规则到 .gitignore"
    } else {
        Skip ".gitignore 已包含 2026-08-07 治理规则。"
    }
} else {
    Write-Host "[DRY-RUN] 将追加以下内容到 .gitignore:" -ForegroundColor Green
    Write-Host $GitignoreAdd
}

# --------------------------------------------------------------
# Phase 6: 生成新的目录结构预览
# --------------------------------------------------------------
Log "Phase 6: 生成新的目录结构预览 (tree.txt)"
if (-not $DRY_RUN) {
    Get-ChildItem -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.venv\\|\\.git\\' } |
        ForEach-Object { $_.FullName.Replace((Get-Location).Path + '\', '') } |
        Sort-Object | Set-Content -Path tree.txt -Encoding UTF8
    Log "已生成 tree.txt ($((Get-Content tree.txt | Measure-Object).Count) 文件)"
} else {
    Write-Host "[DRY-RUN] 将生成 tree.txt（排除 .git/node_modules/.venv/frontend/node_modules）" -ForegroundColor Green
}

# --------------------------------------------------------------
# 完成
# --------------------------------------------------------------
Write-Host ""
Write-Host "=============================================================="
if ($DRY_RUN) {
    Write-Host " DRY-RUN 完成。以上为预览动作，未实际执行。"
    Write-Host " 确认无误后，运行: powershell -ExecutionPolicy Bypass -File migrate.ps1 -Apply"
} else {
    Write-Host " APPLY 完成。请执行以下后续动作:"
    Write-Host "   1. git add -A"
    Write-Host "   2. git commit -m 'chore: governance cleanup (see PROJECT_CLEANLINESS_AUDIT_2026-08-07.md)'"
    Write-Host "   3. 手动更新 docs/INDEX.md 为 ULTIMATE_DESIGN.md 加索引（见 Phase 3 G3）"
}
Write-Host "=============================================================="
