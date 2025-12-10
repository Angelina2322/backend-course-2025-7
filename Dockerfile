# 1. Використовуємо Node.js
FROM node:18

# 2. Створюємо робочу директорію
WORKDIR /app

# 3. Копіюємо package*.json
COPY package*.json ./

# 4. Встановлюємо залежності
RUN npm install

# 5. Копіюємо увесь код
COPY . .

# 6. Вказуємо порт (буде братися з .env)
EXPOSE 3000

# 7. Старт сервера
CMD ["npm", "start"]
