# Используем официальный образ Python
FROM python:3.10-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Объявляем, что мы будем принимать 'аргумент сборки' с этим именем
ARG HF_TOKEN

# Устанавливаем утилиту для входа в систему Hugging Face
RUN pip install huggingface_hub

# Используем токен для авторизации внутри контейнера
RUN huggingface-cli login --token $HF_TOKEN

# Копируем файл с зависимостями и устанавливаем их
COPY requirements.txt .
# Увеличиваем таймаут на случай медленного соединения
RUN pip install --no-cache-dir --timeout=100 -r requirements.txt

# Копируем весь остальной код бэкенда в контейнер
COPY . .

# Сообщаем Docker, что наше приложение будет работать на порту 8000
EXPOSE 8000

# Команда для запуска нашего FastAPI приложения при старте контейнера
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]