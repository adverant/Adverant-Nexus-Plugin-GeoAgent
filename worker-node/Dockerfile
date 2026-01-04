FROM --platform=linux/amd64 node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy TypeScript source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove devDependencies and source files
RUN npm prune --production && \
    rm -rf src tsconfig.json

# Create temp directory
RUN mkdir -p /tmp/geoagent && chmod 777 /tmp/geoagent

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('net').connect(6379, process.env.REDIS_HOST || 'nexus-redis', () => process.exit(0)).on('error', () => process.exit(1))"

# Run worker
CMD ["node", "dist/index.js"]
