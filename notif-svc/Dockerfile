FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 8002

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
