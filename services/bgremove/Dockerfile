# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# onnxruntime (CPU), sem torch. Pillow para I/O, FastAPI/uvicorn pro HTTP.
RUN pip install --no-cache-dir \
      "onnxruntime==1.19.2" \
      "numpy<2" \
      "pillow==10.4.0" \
      "fastapi==0.115.0" \
      "uvicorn[standard]==0.30.6" \
      "python-multipart==0.0.9"

# Modelo silueta (família U^2-Net, ~44 MB) embutido na imagem — sem download
# em runtime, sem volume, deploy determinístico.
ADD https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx /app/silueta.onnx

COPY app.py /app/app.py

EXPOSE 7000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7000/health').status==200 else 1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7000", "--workers", "1"]
