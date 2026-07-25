# FAR-Chain Docker image — offline-ready
#
# 默认跑 offline demo（far demo tess-offline），无需任何 API key。
# 真实 Qwen/百炼 provider 只能通过 `docker compose --env-file .env up` 显式注入（红线：绝不默认读取）。
#
# 构建：  docker build -t far-chain:dev .
# 运行：  docker run --rm far-chain:dev                      # = far demo tess-offline
#         docker run --rm far-chain:dev doctor               # 容器内环境诊断
#         docker run --rm far-chain:dev verify examples/tess-offline/output/demo.far-proof
#
# 设计：better-sqlite3 优先用 prebuilt binary，但保留 build-essential + python3 作为 node-gyp
# 编译兜底——当 prebuild-install 因网络失败时（如 socket hang up），node-gyp rebuild 仍可编译 native。
# 移除 build-essential 会破坏该兜底（实测：prebuild 网络失败 → node-gyp 无 Python → install 失败）。

FROM node:24-slim

# git + ca-certificates + build-essential + python3（better-sqlite3 native node-gyp 兜底）
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates \
        build-essential python3 python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# ── 依赖层（利用 docker layer cache）──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── 源码 ──
COPY . .

ENV NODE_ENV=production
# 红线标记：镜像不内置任何 provider key；offline 优先。
ENV FAR_CHAIN_OFFLINE=1

# far CLI 入口（Node 24 type-stripping 跑 .ts）
ENTRYPOINT ["node", "src/cli/far.ts"]
# 默认：offline TESS demo（零密钥）
CMD ["demo", "tess-offline"]

# ── 可选：Python 科研轴（SymPy/Z3 跨语言哈希一致性）──
# 默认不装（far demo / verify 的 node 轴不依赖它；加速 build）。
# 如需跨语言 Python 轴，在上方依赖层后加：
#   RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
#       && rm -rf /var/lib/apt/lists/* \
#       && pip install --no-cache-dir --break-system-packages -e .
