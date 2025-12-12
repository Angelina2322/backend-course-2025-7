# Базовий образ Node.js
FROM node:18-alpine

# Робоча директорія всередині контейнера
WORKDIR /app

# Копіюємо package.json та package-lock.json для встановлення залежностей
COPY package*.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо всі файли проекту
COPY . .

# Створюємо директорію для кешу (фото, тимчасові файли)
RUN mkdir -p /app/cache

# Відкриваємо порти: 3000 для Node.js і 9229 для дебагу
EXPOSE 3000
EXPOSE 9229

# Стандартна команда для запуску nodemon (можна перевизначати в docker-compose)
CMD ["npm", "run", "dev"]
