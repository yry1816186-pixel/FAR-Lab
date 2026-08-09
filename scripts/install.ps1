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

# 发布版本：git clone/update 固定此 tag（杜绝浮动分支）。发布新 release 时更新此常量。
$ReleaseTag = 'v1.1.0'
# 发布资产校验（见 ── 4b ──）：GitHub Release 附带的 SHA256SUMS 与 sibling 安装脚本。
$Sha256SumsUrl = "https://github.com/yry1816186-pixel/FAR-Lab/releases/download/$ReleaseTag/SHA256SUMS"
$InstallShUrl  = "https://github.com/yry1816186-pixel/FAR-Lab/releases/download/$ReleaseTag/install.sh"

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

# ── 4. clone / update 仓库（钉 release tag，杜绝浮动分支）──
if (Test-Path (Join-Path $InstallDir '.git')) {
  Info "已存在 $InstallDir，更新到 $ReleaseTag ..."
  try { git -C $InstallDir fetch --depth 1 origin tag $ReleaseTag; git -C $InstallDir checkout --force $ReleaseTag }
  catch { Warn "update $ReleaseTag 失败（可能有本地改动；cd $InstallDir; git status）" }
} else {
  Info "clone FAR-Lab@$ReleaseTag → $InstallDir"
  try { git clone --branch $ReleaseTag --depth 1 $RepoUrl $InstallDir }
  catch { Fail "clone $ReleaseTag 失败：检查网络 / $RepoUrl（该 tag 是否已发布？）" }
}
Set-Location $InstallDir
Ok "源码就绪 @ $(git rev-parse --short HEAD)"

# ── 4b. 发布资产防篡改校验（SHA256SUMS · fail-closed）──
# 设计说明（同 install.sh）：irm | iex 分发时脚本无磁盘文件，无法对"正在运行的自己"做
# 文件哈希自指校验；改为：下载 GitHub Release 的 SHA256SUMS 资产（HTTPS/TLS），校验其
# 存在性与格式（必须含 scripts/install.sh 与 scripts/install.ps1 条目），并对同批发布的
# sibling 资产 install.sh 做哈希比对——篡改该批次任一安装脚本必然导致 install.sh 哈希
# 不匹配 → 中止。任何校验失败一律中止（fail-closed）。
$verifyDir = Join-Path $env:TEMP ("far-install-verify-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $verifyDir *> $null
try {
  Info "下载发布校验资产（SHA256SUMS + install.sh）…"
  try { Invoke-WebRequest -Uri $Sha256SumsUrl -OutFile (Join-Path $verifyDir 'SHA256SUMS') -UseBasicParsing -TimeoutSec 60 }
  catch { Fail "发布校验失败：无法下载 SHA256SUMS（$Sha256SumsUrl）。检查网络后重试" }
  $sums = Get-Content (Join-Path $verifyDir 'SHA256SUMS') -ErrorAction Stop
  if (-not ($sums -match '^[0-9a-f]{64}  scripts/install\.(sh|ps1)$')) {
    Fail "SHA256SUMS 格式异常（缺少 scripts/install.* 条目）——发布资产可疑，已中止"
  }
  try { Invoke-WebRequest -Uri $InstallShUrl -OutFile (Join-Path $verifyDir 'install.sh') -UseBasicParsing -TimeoutSec 60 }
  catch { Fail "发布校验失败：无法下载 install.sh（$InstallShUrl）。检查网络后重试" }
  $expectedSh = $null
  foreach ($line in $sums) {
    if ($line -match '^([0-9a-f]{64})\s+scripts/install\.sh$') { $expectedSh = $Matches[1] }
  }
  if (-not $expectedSh) { Fail "SHA256SUMS 中未找到 scripts/install.sh 条目" }
  $actualSh = (Get-FileHash (Join-Path $verifyDir 'install.sh') -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedSh -ne $actualSh) {
    Fail "发布资产校验失败：install.sh 哈希不匹配（防篡改检查）——请从官方渠道重新获取安装脚本"
  }
  Ok "发布资产校验通过（SHA256SUMS 存在性 + install.sh）"
}
finally { Remove-Item -Recurse -Force $verifyDir -ErrorAction SilentlyContinue }

# ── 5. Node 依赖（frozen；失败即 fail-closed，不回退非 frozen）──
Info "pnpm install --frozen-lockfile（Node 依赖·不含大数据）"
try { pnpm install --frozen-lockfile }
catch { Fail "pnpm install --frozen-lockfile 失败：锁文件过期或依赖变更，请更新 pnpm-lock.yaml 后重试（在仓库根执行 pnpm install 刷新锁文件并提交更新后的 pnpm-lock.yaml）。勿用非 frozen 安装绕过（会破坏可复现构建）。" }
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
