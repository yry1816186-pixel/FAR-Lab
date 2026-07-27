# FAR-Lab installer (Windows PowerShell · 终端用户向)
#
# 用法：
#   irm https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.ps1 | iex
#   （Release 发布前 · NEEDS_RELEASE_PUBLICATION：改用 git clone 开发者安装，见 README）
#
# 红线：不写 API key、不下载大数据、不启动 GPU/云、不要求管理员（装到 %USERPROFILE%\.FAR-Lab）。
# 失败 fail-closed，每步可诊断。
# 技术栈：Node ≥24 + pnpm（主）；Python 3.11+（可选科研轴，缺失只 WARN）。

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "· $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "✓ $m" -ForegroundColor Green }
function Warn($m) { Write-Host "! WARN: $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "✗ ERROR: $m" -ForegroundColor Red; exit 1 }

$InstallDir = if ($env:FAR_CHAIN_HOME) { $env:FAR_CHAIN_HOME } else { Join-Path $env:USERPROFILE '.FAR-Lab' }
$RepoUrl    = 'https://github.com/yry1816186-pixel/FAR-Lab.git'
$NodeMin    = 24

# ── 1. git ──
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "git 未找到。安装: https://git-scm.com/download/win 或 winget install Git.Git"
}
Ok "git $(git --version)"

# ── 2. Node ≥24（type-stripping 硬依赖）──
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js 未找到（需 ≥$NodeMin）。安装: https://nodejs.org 或 winget install OpenJS.NodeJS.LTS"
}
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt $NodeMin) {
  Fail "Node ≥$NodeMin 需要（当前 v$([version](node -v).ToString())）。winget install OpenJS.NodeJS --version 24"
}
Ok "Node $(node -v)"

# ── 3. pnpm（corepack 优先）──
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Warn "pnpm 未找到，启用 corepack"
  try { corepack enable; corepack prepare pnpm@10.29.3 --activate } catch { Write-Verbose "corepack unavailable; npm fallback below" }
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    try { npm install -g pnpm@10 } catch { Fail "pnpm 安装失败：手动执行  npm install -g pnpm@10" }
  }
}
Ok "pnpm $(pnpm -v)"

# ── 4. clone / update 仓库 ──
if (Test-Path (Join-Path $InstallDir '.git')) {
  Info "已存在 $InstallDir，拉取最新..."
  try { git -C $InstallDir fetch --depth 1 origin; git -C $InstallDir reset --hard '@{u}' }
  catch { Warn "update 失败（可能有本地改动；cd $InstallDir; git status）" }
} else {
  Info "clone FAR-Lab → $InstallDir"
  try { git clone --depth 1 $RepoUrl $InstallDir }
  catch { Fail "clone 失败：检查网络 / $RepoUrl" }
}
Set-Location $InstallDir
Ok "源码就绪 @ $(git rev-parse --short HEAD)"

# ── 5. Node 依赖 ──
Info "pnpm install --frozen-lockfile（Node 依赖·不含大数据）"
try { pnpm install --frozen-lockfile }
catch {
  Warn "frozen install 失败，重试非 frozen..."
  try { pnpm install } catch { Fail "pnpm install 失败：删 node_modules 后重试  Remove-Item -Recurse -Force node_modules; pnpm install" }
}
Ok "Node 依赖已安装"

# ── 6. Python 科研轴（可选·缺失只 WARN）──
$py = $null
if (Get-Command python -ErrorAction SilentlyContinue) { $py = 'python' }
elseif (Get-Command python3 -ErrorAction SilentlyContinue) { $py = 'python3' }
if ($py) {
  Info "检测到 $py，安装科研轴依赖（sympy/z3·可选）"
  try { pip install -e . *> $null; Ok "Python 科研轴已装" }
  catch { Warn "Python 依赖安装失败（非阻塞·offline demo 不依赖；科研轴将 skip）" }
} else {
  Warn "Python 未找到（offline demo 不需要；科研验证轴 SymPy/Z3 将 skip）"
}

# ── 7. 注册全局 far 命令 ──
$FarTs = Join-Path $InstallDir 'src\cli\far.ts'
Info "注册 far 命令"
$linked = $false
# 源码分发：package.json 无 bin 字段，直接走 wrapper（$linked 保持 $false）
if (-not $linked) {
  Warn "pnpm link --global 失败，写用户 bin wrapper"
  $BinDir = Join-Path $env:USERPROFILE '.far-chain-bin'
  New-Item -ItemType Directory -Force -Path $BinDir *> $null
  $FarCmd = Join-Path $BinDir 'far.cmd'
  "@echo off`r`nnode `"$FarTs`" %*" | Set-Content -Path $FarCmd -Encoding ASCII
  $pathHas = ($env:Path -split ';') -contains $BinDir
  if (-not $pathHas) {
    Warn "far wrapper → $FarCmd，但 $BinDir 不在 PATH。请手动加：`n  [Environment]::SetEnvironmentVariable('Path', `"$BinDir;`$([Environment]::GetEnvironmentVariable('Path','User'))`", 'User')"
  }
  Ok "far wrapper → $FarCmd"
} else {
  Ok "far 已全局注册（pnpm link --global）"
}

# ── 8. far doctor ──
Info "far doctor（环境自诊断·零网络零密钥）"
try { node $FarTs doctor }
catch { Warn "far doctor 报告非全绿（见上方诊断；WARN 不阻塞 offline demo）" }

# ── 9. 下一步 ──
Write-Host ""
Ok "FAR-Lab 安装完成  $InstallDir"
Write-Host ""
Write-Host "  下一步（全程 offline·无需 API key）：" -ForegroundColor White
Write-Host "    far version" -ForegroundColor Cyan
Write-Host "    far doctor" -ForegroundColor Cyan
Write-Host "    far demo tess-offline" -ForegroundColor Cyan
Write-Host "    far verify examples\tess-offline\output\demo.far-proof" -ForegroundColor Cyan
Write-Host ""
Write-Host "  真实 Qwen/百炼推理（可选·需 API key）：见 docs/providers/qwen-dashscope.md"
Write-Host "  文档：https://github.com/yry1816186-pixel/FAR-Lab#readme"
