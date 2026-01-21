# GeoAgent Quick Start Guide

Get GeoAgent running in under 5 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- PostgreSQL 16+ with PostGIS extension
- Redis server

## Quick Installation

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/adverant/Adverant-Nexus-Plugin-GeoAgent.git
cd Adverant-Nexus-Plugin-GeoAgent

# Start with Nexus stack
COMPOSE_PROJECT_NAME=nexus docker-compose -f docker/docker-compose.nexus.yml \
  -f docker/docker-compose.geoagent.yml up -d
```

### Option 2: Local Development

```bash
# Install API dependencies
cd api
npm install

# Run database migrations
npm run migrate

# Start the API server
npm run dev
```

For the Go worker:

```bash
cd worker
go mod download
go run cmd/worker/main.go
```

## Verify Installation

```bash
# Check API health
curl http://localhost:9103/health

# Check Worker metrics
curl http://localhost:9105/metrics

# Test WebSocket connection
# WebSocket URL: ws://localhost:9104
```

## Environment Configuration

Create a `.env` file with the following variables:

```bash
# Service Configuration
PORT=9103
WS_PORT=9104
NODE_ENV=production

# PostgreSQL (Required)
POSTGRES_HOST=nexus-postgres
POSTGRES_PORT=5432
POSTGRES_DATABASE=unified_nexus
POSTGRES_USER=unified_nexus
POSTGRES_PASSWORD=your_password_here
POSTGRES_SCHEMA=geoagent

# Redis
REDIS_HOST=nexus-redis
REDIS_PORT=6379

# Security (Required)
JWT_SECRET=your_jwt_secret_here
NEO4J_PASSWORD=your_neo4j_password_here

# H3 Configuration
H3_DEFAULT_RESOLUTION=9
ENABLE_H3=true

# Feature Flags
ENABLE_WEBSOCKET=true
ENABLE_CACHING=true
ENABLE_METRICS=true
```

## First API Call

### Create a Layer

```bash
curl -X POST http://localhost:9103/api/v1/layers \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{
    "layer_name": "My First Layer",
    "layer_type": "points",
    "visibility": true,
    "metadata": {}
  }'
```

### Add a Feature

```bash
curl -X POST http://localhost:9103/api/v1/features \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{
    "layer_id": "YOUR_LAYER_ID",
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "properties": {
      "name": "Dublin Office",
      "type": "headquarters"
    }
  }'
```

### Query Features by Bounding Box

```bash
curl "http://localhost:9103/api/v1/features?bbox=-6.5,53.0,-6.0,54.0&limit=100" \
  -H "x-tenant-id: default"
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| API | 9103 | REST API endpoints |
| WebSocket | 9104 | Real-time event streaming |
| Worker Metrics | 9105 | Prometheus metrics |
| MinIO API | 9106 | Object storage API |
| MinIO Console | 9107 | Object storage web UI |
| ML Service | 9108 | Machine learning processing |

## Next Steps

- Read the [Use Cases Guide](USE-CASES.md) for practical examples
- Review the [Technical Documentation](TECHNICAL.md) for API reference
- Explore the [Architecture Guide](ARCHITECTURE.md) for system design

## Troubleshooting

### PostGIS Extension Missing

```bash
docker exec -it nexus-postgres psql -U unified_nexus -d unified_nexus \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### Migration Failed

```bash
cd api
npm run migrate
```

### Connection Issues

```bash
# Verify network connectivity
docker network ls | grep nexus
docker network inspect nexus-network
```

## Support

- GitHub Issues: https://github.com/adverant/Adverant-Nexus-Plugin-GeoAgent/issues
- Documentation: https://github.com/adverant/Adverant-Nexus-Plugin-GeoAgent#readme
