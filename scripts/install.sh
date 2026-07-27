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

# ── 5. clone / update 仓库 ──
if [ -d "$INSTALL_DIR/.git" ]; then
  info "已存在 $INSTALL_DIR，拉取最新..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin 2>/dev/null || warn "fetch 失败（继续用本地版本）"
  git -C "$INSTALL_DIR" reset --hard '@{u}' 2>/dev/null || warn "update 失败（可能有本地改动；cd $INSTALL_DIR && git status 查看）"
else
  info "clone FAR-Lab → $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" || err "clone 失败：检查网络 / $REPO_URL"
fi
cd "$INSTALL_DIR"
ok "源码就绪 @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')"

# ── 6. Node 依赖（frozen；失败给修复指引）──
info "pnpm install --frozen-lockfile（Node 依赖·不含大数据）"
if ! pnpm install --frozen-lockfile; then
  warn "frozen install 失败，重试非 frozen..."
  pnpm install || err "pnpm install 失败：删 node_modules 后重试  rm -rf node_modules && pnpm install"
fi
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
