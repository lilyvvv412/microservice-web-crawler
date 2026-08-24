FROM node:18-alpine

WORKDIR /app/services/extraction-service

COPY services/extraction-service/package*.json ./

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll use the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm install

COPY services/extraction-service ./
COPY shared /app/shared

EXPOSE 3001

CMD ["npm", "start"]
