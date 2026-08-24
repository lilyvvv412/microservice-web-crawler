FROM node:18-alpine

WORKDIR /app/services/api-gateway

# Copy package.json and package-lock.json
COPY services/api-gateway/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY services/api-gateway ./
COPY shared /app/shared

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose the port
EXPOSE 3000

# Start the service
CMD ["node", "src/app.js"]
