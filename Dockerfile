# FAR-Chain Docker image — offline-ready
#
# 默认跑 offline demo（far demo tess-offline），无需任何 API key。
# 真实 Qwen/百炼 provider 只能通过 `docker compose --env-file .env up` 显式注入（红线：绝不默认读取）。
#
# 构建：  docker build -t far-chain:dev .
# 运行：  docker run --rm far-chain:dev                      # = far demo tess-offline
#         docker run --rm far-chain:dev doctor               # 容器内环境诊断
#         docker run --rm far-chain:dev verify examples/tess-offline/output/demo.far-proof

FROM node:24-slim

# 构建工具（better-sqlite3 native 编译兜底）+ Python 科研轴（SymPy/Z3）+ git
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        build-essential python3-dev \
        git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# ── 依赖层（利用 docker layer cache）──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml pyproject.toml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# Python 科研轴（sympy/z3·离线重算跨语言哈希一致性）
RUN pip install --no-cache-dir --break-system-packages -e .

# ── 源码 ──
COPY . .

ENV NODE_ENV=production
# 红线标记：镜像不内置任何 provider key；offline 优先。
ENV FAR_CHAIN_OFFLINE=1

# far CLI 入口（Node 24 type-stripping 跑 .ts）
ENTRYPOINT ["node", "src/cli/far.ts"]
# 默认：offline TESS demo（零密钥）
CMD ["demo", "tess-offline"]
