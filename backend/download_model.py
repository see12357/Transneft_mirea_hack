# download_model.py
from langchain_community.embeddings import HuggingFaceEmbeddings
import os

MODEL_NAME = "intfloat/multilingual-e5-large-instruct"
CACHE_DIR = "models_cache" # Папка, куда будут скачаны модели

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

print(f"Начинаю загрузку модели '{MODEL_NAME}' в папку '{CACHE_DIR}'...")

# Инициализируем модель, указав папку для кеширования
# Это запустит процесс скачивания
HuggingFaceEmbeddings(
    model_name=MODEL_NAME,
    cache_folder=CACHE_DIR
)

print("✅ Модель успешно загружена и сохранена в кеше.")