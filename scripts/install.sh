#!/usr/bin/env bash
# FAR-Lab installer (macOS / Linux / WSL · 终端用户向)
#
# 用法：
#   curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
#   （Release 发布前 · NEEDS_RELEASE_PUBLICATION：改用 git clone 开发者安装，见 README）
#
# 红线：不写 API key、不下载大数据、不启动 GPU/云、不要求 root（装到 ~/.FAR-Lab）。
# 失败 fail-closed（set -euo pipefail + 显式 err），每步可诊断。
# 技术栈：Node ≥24 + pnpm（主）；Python 3.11+（可选科研轴，缺失只 WARN）。

set -euo pipefail

INSTALL_DIR="${FAR_CHAIN_HOME:-$HOME/.FAR-Lab}"
REPO_URL="https://github.com/yry1816186-pixel/FAR-Lab.git"
NODE_MIN_MAJOR=24

# 发布版本：git clone/update 固定此 tag（杜绝浮动分支）。发布新 release 时更新此常量。
RELEASE_TAG="v1.1.0"
# 发布资产校验（见 ── 5b ──）：GitHub Release 附带的 SHA256SUMS 与 sibling 安装脚本。
SHA256SUMS_URL="https://github.com/yry1816186-pixel/FAR-Lab/releases/download/${RELEASE_TAG}/SHA256SUMS"
INSTALL_PS1_URL="https://github.com/yry1816186-pixel/FAR-Lab/releases/download/${RELEASE_TAG}/install.ps1"

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
[ -t 1 ] || { RED=''; GRN=''; YLW=''; CYN=''; RST=''; }

info() { printf "%s·%s %s\n" "$CYN" "$RST" "$*"; }
ok()   { printf "%s✓%s %s\n" "$GRN" "$RST" "$*"; }
warn() { printf "%s!%s WARN: %s\n" "$YLW" "$RST" "$*" >&2; }
err()  { printf "%s✗%s ERROR: %s\n" "$RED" "$RST" "$*" >&2; exit 1; }

# ── 1. OS / arch ──
OS_NAME="$(uname -s)"; ARCH="$(uname -m)"
info "OS=$OS_NAME  ARCH=$ARCH  INSTALL_DIR=$INSTALL_DIR"
case "$OS_NAME" in
  Linux*)   PLATFORM="linux" ;;
  Darwin*)  PLATFORM="macos" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows-wsl-git-bash" ;;
  *) warn "未识别的 OS: $OS_NAME（继续，但不保证兼容）" ;;
esac

# ── 2. git ──
command -v git >/dev/null 2>&1 || err "git 未找到。安装: https://git-scm.com/downloads"
ok "git $(git --version 2>&1 | awk '{print $3}')"

# ── 3. Node ≥24（type-stripping 硬依赖）──
command -v node >/dev/null 2>&1 || err "Node.js 未找到（需 ≥$NODE_MIN_MAJOR）。安装: https://nodejs.org 或 nvm install $NODE_MIN_MAJOR"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ] || err "Node ≥$NODE_MIN_MAJOR 需要（当前 v$(node -v | tr -d v)）。nvm install $NODE_MIN_MAJOR"
ok "Node $(node -v)"

# ── 4. pnpm（corepack 优先 / npm 兜底）──
if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm 未找到，尝试启用 corepack"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable 2>/dev/null || true
    corepack prepare pnpm@10.29.3 --activate 2>/dev/null || true
  fi
  command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@10 >/dev/null 2>&1 || err "pnpm 安装失败：手动执行  npm install -g pnpm@10"
fi
ok "pnpm $(pnpm -v)"

# ── 5. clone / update 仓库（钉 release tag，杜绝浮动分支）──
if [ -d "$INSTALL_DIR/.git" ]; then
  info "已存在 $INSTALL_DIR，更新到 $RELEASE_TAG ..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin tag "$RELEASE_TAG" 2>/dev/null || warn "fetch $RELEASE_TAG 失败（继续用本地版本）"
  git -C "$INSTALL_DIR" checkout --force "$RELEASE_TAG" 2>/dev/null || warn "checkout $RELEASE_TAG 失败（可能有本地改动；cd $INSTALL_DIR && git status 查看）"
else
  info "clone FAR-Lab@$RELEASE_TAG → $INSTALL_DIR"
  git clone --branch "$RELEASE_TAG" --depth 1 "$REPO_URL" "$INSTALL_DIR" || err "clone $RELEASE_TAG 失败：检查网络 / $REPO_URL（该 tag 是否已发布？）"
fi
cd "$INSTALL_DIR"
ok "源码就绪 @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')"

# ── 5b. 发布资产防篡改校验（SHA256SUMS · fail-closed）──
# 设计说明：本脚本经 `curl … | bash` 分发时 $0 指向 stdin，无法对"正在运行的自己"做
# 文件哈希自指校验；因此采用等价防篡改方案：下载 GitHub Release 的 SHA256SUMS 资产
# （HTTPS/TLS），校验其存在性与格式（必须含 scripts/install.sh 与 scripts/install.ps1
# 条目），并对同批发布的 sibling 资产 install.ps1 做哈希比对——篡改该批次任一安装脚本
# 必然导致 install.ps1 哈希不匹配 → 中止；另对克隆仓库内的两份安装脚本与清单比对，
# 覆盖"仓库内容被替换"方向。运行中脚本本体的信任来自分发通道（HTTPS + 本脚本未被篡改
# 的前提本身即该校验所保护的对象）。任何校验失败一律中止（fail-closed）。
command -v curl >/dev/null 2>&1 || err "curl 未找到（发布校验需要）。安装: apt-get install curl / brew install curl"
VERIFY_DIR="$(mktemp -d)" || err "无法创建临时目录"
trap 'rm -rf "$VERIFY_DIR"' EXIT
info "下载发布校验资产（SHA256SUMS + install.ps1）…"
curl -fsSL --max-time 60 "$SHA256SUMS_URL" -o "$VERIFY_DIR/SHA256SUMS" || err "发布校验失败：无法下载 SHA256SUMS（$SHA256SUMS_URL）。检查网络后重试"
curl -fsSL --max-time 60 "$INSTALL_PS1_URL" -o "$VERIFY_DIR/install.ps1" || err "发布校验失败：无法下载 install.ps1（$INSTALL_PS1_URL）。检查网络后重试"
grep -Eq '^[0-9a-f]{64}  scripts/install\.(sh|ps1)$' "$VERIFY_DIR/SHA256SUMS" || err "SHA256SUMS 格式异常（缺少 scripts/install.* 条目）——发布资产可疑，已中止"
sha256_of() {
  if   command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl  >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else err "无 sha256 工具（需 sha256sum / shasum / openssl 之一）"; fi
}
EXPECTED_PS1="$(awk '$2=="scripts/install.ps1"{print $1}' "$VERIFY_DIR/SHA256SUMS")"
ACTUAL_PS1="$(sha256_of "$VERIFY_DIR/install.ps1")"
[ -n "$EXPECTED_PS1" ] && [ "$EXPECTED_PS1" = "$ACTUAL_PS1" ] || err "发布资产校验失败：install.ps1 哈希不匹配（防篡改检查）——请从官方渠道重新获取安装脚本"
# 克隆仓库侧：两份安装脚本须与发布清单一致（防仓库内容被替换）
for _f in scripts/install.sh scripts/install.ps1; do
  _e="$(awk -v p="$_f" '$2==p{print $1}' "$VERIFY_DIR/SHA256SUMS")"
  _a="$(sha256_of "$INSTALL_DIR/$_f")"
  [ -n "$_e" ] && [ "$_e" = "$_a" ] || err "仓库内 $_f 与发布清单 SHA256 不符——源码可能被篡改，已中止"
done
ok "发布资产校验通过（SHA256SUMS 存在性 + install.ps1 + 仓库侧 install.*）"

# ── 6. Node 依赖（frozen；失败即 fail-closed，不回退非 frozen）──
info "pnpm install --frozen-lockfile（Node 依赖·不含大数据）"
pnpm install --frozen-lockfile || err "pnpm install --frozen-lockfile 失败：锁文件过期或依赖变更，请更新 pnpm-lock.yaml 后重试（在仓库根执行 pnpm install 刷新锁文件并提交更新后的 pnpm-lock.yaml）。勿用非 frozen 安装绕过（会破坏可复现构建）。"
ok "Node 依赖已安装"

# ── 7. Python 科研轴（可选·缺失只 WARN）──
PY_BIN=""
if command -v python3 >/dev/null 2>&1; then PY_BIN="python3"
elif command -v python >/dev/null 2>&1; then PY_BIN="python"; fi
if [ -n "$PY_BIN" ]; then
  info "检测到 $PY_BIN，安装科研轴依赖（sympy/z3·可选）"
  if pip install -e . >/dev/null 2>&1 || $PY_BIN -m pip install -e . >/dev/null 2>&1; then
    ok "Python 科研轴已装（SymPy/Z3 验证轴可用）"
  else
    warn "Python 依赖安装失败（非阻塞·offline demo 不依赖；科研轴将 skip）"
  fi
else
  warn "Python 未找到（offline demo 不需要；科研验证轴 SymPy/Z3 将 skip）"
fi

# ── 8. 注册全局 far 命令（源码分发·写用户 bin wrapper）──
FAR_TS="$INSTALL_DIR/src/cli/far.ts"
info "注册 far 命令"
BIN_DIR="$HOME/.local/bin"; mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/far" <<EOF
#!/usr/bin/env bash
exec node "$FAR_TS" "\$@"
EOF
chmod +x "$BIN_DIR/far"
case ":$PATH:" in
  *":$BIN_DIR:"*) ok "far wrapper → $BIN_DIR/far" ;;
  *) warn "far wrapper 写入 $BIN_DIR/far，但该目录不在 PATH。请加  export PATH=\"$BIN_DIR:\$PATH\"  到 ~/.bashrc / ~/.zshrc" ;;
esac

# ── 9. far doctor（环境自诊断）──
info "far doctor（环境自诊断·零网络零密钥）"
node "$FAR_TS" doctor || warn "far doctor 报告非全绿（见上方诊断；WARN 不阻塞 offline demo）"

# ── 10. 下一步 ──
cat <<EOF

${GRN}✓ FAR-Lab 安装完成${RST}  $INSTALL_DIR

  下一步（全程 offline·无需 API key）：
    ${CYN}far version${RST}
    ${CYN}far doctor${RST}
    ${CYN}far demo tess-offline${RST}
    ${CYN}far export far-proof --demo-chain --force${RST}
    ${CYN}far verify .far-proof${RST}

  真实 Qwen/百炼推理（可选·需 API key）：见 docs/providers/qwen-dashscope.md
  文档：https://github.com/yry1816186-pixel/FAR-Lab#readme
EOF
