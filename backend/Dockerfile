FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs (house standard for Python)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
