# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# All upstream inputs are immutable OCI index digests. uv is available only in
# the build stages; the final official Python runtime contains no uv/uvx binary.
FROM ghcr.io/astral-sh/uv:0.12.1@sha256:cf4eedcaa81655197f625739489effcbe71b61ceb1506f332c3facae5deceded AS uvbin
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim@sha256:e5b65587bce7de595f299855d7385fe7fca39b8a74baa261ba1b7147afa78e58 AS build

COPY --from=uvbin /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /build
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev
COPY farlab_experiment_runtime ./farlab_experiment_runtime
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
COPY --from=build /build/.venv /opt/farlab/.venv
COPY sandbox-policy.json /opt/farlab/sandbox-policy.json

ENV PATH=/opt/farlab/.venv/bin:/usr/local/bin:/usr/bin:/bin \
    PYTHONPATH= \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=0 \
    HOME=/tmp \
    TMPDIR=/tmp \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    FARLAB_SANDBOX_POLICY_PATH=/opt/farlab/sandbox-policy.json

USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["/opt/farlab/.venv/bin/python", "-I", "-m", "farlab_experiment_runtime.sandbox_main"]
