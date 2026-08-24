FROM node:18-alpine

WORKDIR /app/services/scheduler-service

# Copy package files
COPY services/scheduler-service/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy service files
COPY services/scheduler-service ./
COPY ./shared /app/shared

# Expose the service port
EXPOSE 3005

# Start the service
CMD ["node", "src/app.js"]
