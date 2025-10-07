# --- ЭТАП 1: СБОРКА REACT ПРИЛОЖЕНИЯ ---
FROM node:18-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json, package-lock.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем весь остальной код фронтенда
COPY . .

# Собираем статические файлы для продакшена (в папку /app/dist)
RUN npm run build


# --- ЭТАП 2: НАСТРОЙКА И ЗАПУСК NGINX ---
FROM nginx:stable-alpine

# Копируем нашу кастомную конфигурацию для Nginx
# nginx.conf должен лежать в той же папке, что и этот Dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранные файлы из ЭТАПА 1 в папку, которую Nginx раздает по умолчанию
COPY --from=builder /app/dist /usr/share/nginx/html

# Сообщаем Docker, что контейнер будет работать на порту 80
EXPOSE 80

# Команда для запуска Nginx в "нефоновом" режиме
CMD ["nginx", "-g", "daemon off;"]