FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends unar libreoffice-writer libreoffice-calc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN uv sync --frozen --no-dev

ENV FILETRACE_STORAGE_ROOT=/data/storage
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
