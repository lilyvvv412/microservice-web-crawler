FROM node:18-alpine

WORKDIR /app/services/search-service

COPY services/search-service/package*.json ./

RUN npm install

COPY services/search-service ./
COPY shared /app/shared

EXPOSE 3003

CMD ["npm", "start"]
