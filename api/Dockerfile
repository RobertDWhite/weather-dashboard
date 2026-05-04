FROM python:3.12-slim AS base
WORKDIR /app
RUN adduser --disabled-password --no-create-home appuser
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
USER appuser
EXPOSE 8000
# Single uvicorn worker. The app is overwhelmingly I/O-bound (proxy + cache),
# so async on one worker scales to hundreds of concurrent connections without
# duplicating the in-process TTL caches across workers (which would multiply
# upstream calls and Ollama invocations). Tune --limit-concurrency upward
# only if profiling shows the event loop saturated.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--limit-concurrency", "256", "--timeout-keep-alive", "30"]
