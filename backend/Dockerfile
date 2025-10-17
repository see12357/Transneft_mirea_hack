FROM python:3.10-slim

WORKDIR /app

ARG HF_TOKEN
RUN pip install huggingface_hub
RUN huggingface-cli login --token $HF_TOKEN



RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir torchcodec
COPY ./models_cache /root/.cache/huggingface

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]