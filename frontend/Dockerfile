# --- ЭТАП СБОРКИ (BUILD STAGE) ---
FROM node:18-alpine as builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем остальной код фронтенда
COPY . .

# Собираем статические файлы для продакшена
RUN npm run build

# --- ЭТАП РАБОТЫ (PRODUCTION STAGE) ---
FROM nginx:stable-alpine

# Копируем только собранные статические файлы из этапа сборки
# в папку, из которой Nginx раздает контент
COPY --from=builder /app/dist /usr/share/nginx/html

# Сообщаем Docker, что контейнер будет слушать порт 80
EXPOSE 80

# Команда для запуска Nginx
CMD ["nginx", "-g", "daemon off;"]