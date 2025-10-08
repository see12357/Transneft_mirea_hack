# --- ЭТАП 1: СБОРКА REACT ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- ЭТАП 2: НАСТРОЙКА NGINX ---
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем нашу конфигурацию Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]