FROM python:3.10-slim

WORKDIR /app

ARG HF_TOKEN
RUN pip install huggingface_hub
RUN huggingface-cli login --token $HF_TOKEN

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --- ИЗМЕНЕНИЯ ЗДЕСЬ ---
# Копируем предзагруженные модели в стандартную папку кеша Hugging Face внутри контейнера
# Эта папка по умолчанию /root/.cache/huggingface
COPY ./models_cache /root/.cache/huggingface

# Копируем остальной код приложения
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]