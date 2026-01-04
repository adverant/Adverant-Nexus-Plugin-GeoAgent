# Multi-stage Dockerfile for GeoAgent API Service
# Optimized for layer caching and minimal image size

# Base stage with common dependencies
FROM --platform=linux/amd64 node:20-alpine AS base
RUN apk update && apk add --no-cache \
    tini \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*
WORKDIR /app

# Dependencies stage - cached unless package.json changes
FROM --platform=linux/amd64 base AS deps
RUN apk update && apk add --no-cache python3 make g++ git
# Only copy package.json - ignore stale lock file
COPY package.json ./
# Fresh npm install to generate clean lock file
RUN npm install && \
    npm cache clean --force && \
    cp -R node_modules prod_node_modules

# Build stage - prepare source without compilation
FROM --platform=linux/amd64 deps AS builder
COPY tsconfig*.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
# Skip TypeScript compilation - use tsx runtime
RUN echo "Source prepared for tsx runtime" && ls -la src/

# Development stage
FROM --platform=linux/amd64 base AS development
ENV NODE_ENV=development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app ./
COPY package*.json ./
EXPOSE 9095 9096 9229
CMD ["npm", "run", "dev"]

# Test stage
FROM --platform=linux/amd64 base AS test
ENV NODE_ENV=test
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app ./
COPY package*.json ./
COPY jest.config.js ./
COPY tests/ ./tests/
RUN npm run test

# Production stage - minimal final image
FROM --platform=linux/amd64 base AS production

# Install runtime dependencies
RUN apk update && apk add --no-cache \
    postgresql-client \
    python3 \
    py3-pip \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/prod_node_modules ./node_modules

# Copy source files
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig*.json ./
COPY --chown=nodejs:nodejs package.json ./

# Install tsx for TypeScript runtime
USER root
RUN npm install --save tsx && \
    mkdir -p /app/logs /app/temp && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 9095 9096

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9095/health || exit 1

# Environment variables
ENV NODE_ENV=production \
    PORT=9095 \
    WS_PORT=9096 \
    LOG_LEVEL=info

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/index.ts"]