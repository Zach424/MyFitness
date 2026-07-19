FROM python:3.12.11-slim@sha256:47ae396f09c1303b8653019811a8498470603d7ffefc29cb07c88f1f8cb3d19f

ARG BUILD_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="MyFitness AI worker" \
      org.opencontainers.image.description="MyFitness structured explanation and food-photo worker" \
      org.opencontainers.image.source="https://github.com/Zach424/MyFitness" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.lock ./
RUN pip install --no-cache-dir --retries 10 --timeout 30 -r requirements.lock

COPY app ./app

RUN useradd --create-home --uid 10001 myfitness
USER myfitness

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
