FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    STYLEE_PROVIDER=deepseek \
    STYLEE_REQUIRE_AUTH=true \
    LLM_MAX_TOKENS=2048

WORKDIR /app
COPY . /app

RUN useradd --create-home --uid 10001 stylee \
    && chown -R stylee:stylee /app
USER stylee

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','10000')+'/health', timeout=3)"

CMD ["python3", "serve.py", "--host", "0.0.0.0"]
