FROM node:18-alpine

WORKDIR /app/services/storage-service

COPY services/storage-service/package*.json ./
RUN npm install --omit=dev

COPY services/storage-service ./
COPY shared /app/shared

USER node

EXPOSE 3002

CMD ["node", "app.js"]
