# Multi-stage Dockerfile for GeoAgent Worker
FROM --platform=linux/amd64 golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Copy source code
COPY . .

# Download dependencies and build
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o geoagent-worker \
    ./cmd/worker

# Runtime image
FROM --platform=linux/amd64 alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl

# Create non-root user
RUN addgroup -g 1000 geoagent && \
    adduser -D -u 1000 -G geoagent geoagent

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/geoagent-worker /app/geoagent-worker

# Create directories
RUN mkdir -p /app/temp /app/logs && \
    chown -R geoagent:geoagent /app

# Switch to non-root user
USER geoagent

# Environment variables
# Environment variables - POSTGRES_URL must be provided at runtime
# Example: POSTGRES_URL=postgresql://user:password@host:5432/database
ENV REDIS_URL=redis://nexus-redis:6379 \
    GRAPHRAG_URL=http://nexus-graphrag:8090 \
    MAGEAGENT_URL=http://nexus-mageagent:8080 \
    TEMP_DIR=/app/temp \
    LOG_LEVEL=info
# POSTGRES_URL - Required: Must be set at runtime via environment variable or K8s secret

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD pgrep geoagent-worker > /dev/null || exit 1

# Expose metrics port
EXPOSE 9097

# Start worker
ENTRYPOINT ["/app/geoagent-worker"]