FROM node:22-slim

# Install system utilities if needed (like curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev

# Copy project files
COPY . .

# Build application
RUN npm run build

# Default environment
ENV NODE_ENV=production
ENV PORT=7860

# Expose default port (7860 is default for Hugging Face Spaces, Koyeb will override via $PORT)
EXPOSE 7860 3000 8080

# Hugging Face Spaces runs as user with UID 1000, ensure permissions for data directory
RUN mkdir -p /app/data && chown -R 1000:1000 /app

USER 1000

CMD ["node", "dist/server.cjs"]
