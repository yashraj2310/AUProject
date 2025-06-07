# server-side/Dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy and install deps
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Expose the API port
EXPOSE 5000

# Start the server
CMD ["node", "main.js"]
