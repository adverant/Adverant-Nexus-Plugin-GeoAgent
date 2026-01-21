# GeoAgent Service - Spatial Intelligence for Unified Nexus Stack

## Overview

GeoAgent is a comprehensive geospatial microservice that extends the Unified Nexus Stack with spatial intelligence capabilities, real-time tracking, H3 hexagonal grid analysis, and advanced geospatial operations. It seamlessly integrates with existing Nexus services (GraphRAG, MageAgent, Qdrant, Neo4j) to provide location-aware AI reasoning.

**Production Status**: ✅ Successfully deployed to nexus Docker stack (November 4, 2025)

**HyperModal Integration**: ✅ Complete (November 5, 2025) - Advanced multi-modal geospatial processing capabilities (LiDAR, hyperspectral, SAR, thermal) integrated into GeoAgent with MinIO storage (9106-9107) and ML service (9108)

## Features

### Core Capabilities
- 🗺️ **Spatial Operations**: Proximity search, intersection, buffering, spatial joins
- 📍 **Real-time Tracking**: Asset tracking with WebSocket streaming
- 🔷 **H3 Hexagonal Grid**: Multi-resolution spatial indexing using Uber H3
- 🚧 **Geofencing**: Dynamic boundary monitoring with enter/exit/dwell triggers
- 📊 **Spatial Analytics**: Heatmaps, clustering, trajectory analysis
- 📁 **File Ingestion**: Support for GeoJSON, KML, Shapefile, GPX, CSV formats
- 🔄 **Integration**: Seamless integration with GraphRAG, MageAgent, Qdrant, Neo4j

### Technical Features
- **JSONB Geometry Storage** with PostGIS-optional architecture
- **WebSocket streaming** for real-time updates (<50ms latency)
- **Asynq job queue** for async processing (Go-based)
- **Multi-tenancy** support with row-level security
- **TypeScript API** with 8 route modules
- **Go Worker** for spatial processing tasks
- **MCP tool integration** for Nexus operations

### HyperModal Capabilities (✅ NEW: Integrated Nov 5, 2025)
- 🛰️ **LiDAR Processing**: DEM/DSM/CHM generation, ground classification, building/vegetation extraction
  - Performance: <45s for 100M points (DEM generation)
  - Algorithms: Cloth Simulation Filter (CSF), DBSCAN clustering
  - Output: GeoTIFF, point clouds with classifications
- 🌈 **Hyperspectral Analysis**: Spectral unmixing, material identification, vegetation indices
  - Performance: <30s for 1000×1000×224 bands (spectral unmixing)
  - Indices: NDVI, EVI, SAVI, NDWI, GNDVI, RECI, CVI, LAI
  - Libraries: USGS, ASTER spectral libraries for material matching
- 📡 **SAR Processing**: InSAR, coherence calculation, change detection
  - Capabilities: Ground deformation, earthquake monitoring, subsidence mapping
  - Filters: Lee speckle filter, multi-look processing
- 🔥 **Thermal Imaging**: Heat mapping, anomaly detection, temperature extraction
  - Performance: <2s for 4K thermal imagery
  - Detection: Statistical outliers (2σ, 3σ thresholds)
- 🔀 **Multi-Modal Fusion**: Combine LiDAR + hyperspectral + thermal for comprehensive analysis
  - Methods: Pixel-level, feature-level, decision-level fusion
  - Use cases: Precision agriculture, archaeological surveys, disaster assessment

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    GeoAgent Service (Extended)                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │   API Service   │  │   Worker Service  │  │  ML Service (NEW)  │ │
│  │  (TypeScript)   │  │      (Go)         │  │   (Python/PyTorch) │ │
│  │   Port: 9103    │  │   Port: 9105      │  │    Port: 9108      │ │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬─────────┘ │
│           │                     │                        │            │
│  ┌────────▼──────────────────────▼────────┐  ┌─────────▼──────────┐│
│  │         PostGIS Database                │  │  MinIO Storage     ││
│  │  - Spatial data storage                 │  │  (9106-9107) (NEW) ││
│  │  - Geometric calculations               │  │  - Large files     ││
│  │  - Spatial indexing (GIST)              │  │  - LAS/LAZ/HDF5    ││
│  └─────────────────────────────────────────┘  └────────────────────┘│
│                                                                        │
│  Core Capabilities:                  HyperModal Capabilities (NEW):   │
│  ├─ Spatial operations               ├─ LiDAR processing              │
│  ├─ H3 hexagonal grid                ├─ Hyperspectral analysis        │
│  ├─ Real-time tracking               ├─ SAR processing                │
│  └─ Geofencing                       ├─ Thermal imaging               │
│                                      └─ Multi-modal fusion            │
│                                                                        │
│  Integration Points:                                                   │
│  ├─ GraphRAG: Spatial relationships + HyperModal analysis storage     │
│  ├─ Qdrant: Geo-filtered semantic search                              │
│  ├─ MageAgent: Spatial reasoning + Multi-agent geospatial AI          │
│  └─ FileProcessAgent: Geospatial file ingestion                      │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Unified Nexus stack running (PostgreSQL, Redis, etc.)
- PostgreSQL 16+ (PostGIS optional but recommended for advanced spatial operations)

### Installation

1. **Clone the repository** (if not already done):
```bash
git clone https://github.com/adverant-ai/adverant-Nexus.git
cd adverant-Nexus
```

2. **Start GeoAgent services** with the nexus stack:
```bash
COMPOSE_PROJECT_NAME=nexus docker-compose -f docker/docker-compose.nexus.yml -f docker/docker-compose.geoagent.yml up -d
```

3. **Verify installation**:
```bash
# Check API health
curl http://localhost:9103/health

# Check Worker health
curl http://localhost:9105/metrics

# Check WebSocket endpoint is available
# WebSocket URL: ws://localhost:9104
```

4. **(Optional) Enable PostGIS** for advanced spatial operations:
```bash
docker exec -it nexus-postgres psql -U unified_nexus -d unified_nexus -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

**Note**: GeoAgent works without PostGIS using JSONB geometry storage. PostGIS provides additional advanced spatial functions.

## API Endpoints

### Base URLs
- HTTP API: `http://localhost:9103`
- WebSocket: `ws://localhost:9104`
- Worker Metrics: `http://localhost:9105/metrics`
- MinIO API: `http://localhost:9106`
- MinIO Console: `http://localhost:9107`
- ML Service: `http://localhost:9108`

### Core Endpoints

#### Layers
- `GET /api/v1/layers` - List all layers
- `POST /api/v1/layers` - Create new layer
- `GET /api/v1/layers/:id` - Get layer details
- `PUT /api/v1/layers/:id` - Update layer
- `DELETE /api/v1/layers/:id` - Delete layer

#### Features
- `GET /api/v1/features` - List features
- `POST /api/v1/features` - Create feature
- `GET /api/v1/features/:id` - Get feature
- `PUT /api/v1/features/:id` - Update feature
- `DELETE /api/v1/features/:id` - Delete feature

#### Spatial Operations
- `POST /api/v1/spatial/proximity` - Find features within radius
- `POST /api/v1/spatial/within` - Find features within polygon
- `POST /api/v1/spatial/buffer` - Create buffer zone
- `POST /api/v1/spatial/intersection` - Calculate intersections
- `POST /api/v1/spatial/heatmap` - Generate heatmap
- `POST /api/v1/spatial/clustering` - Perform spatial clustering

#### Real-time Tracking
- `POST /api/v1/tracking/update` - Update asset location
- `GET /api/v1/tracking/assets/:id` - Get asset trajectory
- `POST /api/v1/tracking/analyze` - Analyze trajectory

#### Geofencing
- `POST /api/v1/geofencing/create` - Create geofence
- `GET /api/v1/geofencing/active` - List active geofences
- `POST /api/v1/geofencing/check` - Check geofence triggers

#### H3 Grid Operations
- `POST /api/v1/h3/aggregate` - Aggregate to H3 grid
- `POST /api/v1/h3/rollup` - Hierarchical aggregation
- `GET /api/v1/h3/neighbors` - Get H3 neighbors

#### File Ingestion
- `POST /api/v1/ingestion/upload` - Upload geospatial file
- `POST /api/v1/ingestion/url` - Ingest from URL
- `GET /api/v1/ingestion/jobs/:id` - Check ingestion status

### HyperModal Endpoints (✅ NEW: 20 Endpoints)

#### LiDAR Processing
- `POST /api/v1/hypermodal/lidar/ingest` - Upload LAS/LAZ file
- `POST /api/v1/hypermodal/lidar/process` - Generate DEM/DSM/CHM
- `POST /api/v1/hypermodal/lidar/classify` - Ground classification
- `POST /api/v1/hypermodal/lidar/extract` - Extract buildings/vegetation

#### Hyperspectral Analysis
- `POST /api/v1/hypermodal/spectral/ingest` - Upload hyperspectral data (HDF5/ENVI)
- `POST /api/v1/hypermodal/spectral/unmix` - Spectral unmixing (NMF/FCLS)
- `POST /api/v1/hypermodal/spectral/identify` - Material identification
- `POST /api/v1/hypermodal/spectral/vegetation` - Calculate vegetation indices

#### SAR Processing
- `POST /api/v1/hypermodal/sar/ingest` - Upload SAR data
- `POST /api/v1/hypermodal/sar/interferometry` - InSAR processing
- `POST /api/v1/hypermodal/sar/coherence` - Coherence calculation
- `POST /api/v1/hypermodal/sar/change` - Change detection

#### Thermal Imaging
- `POST /api/v1/hypermodal/thermal/ingest` - Upload thermal imagery
- `POST /api/v1/hypermodal/thermal/heatmap` - Generate heat map
- `POST /api/v1/hypermodal/thermal/anomaly` - Detect anomalies

#### Multi-Modal Fusion
- `POST /api/v1/hypermodal/fusion/multimodal` - Fuse multiple data types
- `POST /api/v1/hypermodal/fusion/report` - Generate comprehensive report

#### Job Management
- `GET /api/v1/hypermodal/jobs/:jobId` - Check job status
- `DELETE /api/v1/hypermodal/jobs/:jobId` - Cancel job

#### Infrastructure
- MinIO Console: `http://localhost:9107` (Credentials: Set via MINIO_ROOT_USER and MINIO_ROOT_PASSWORD environment variables)
- ML Service Health: `http://localhost:9108/health`

## WebSocket Events

### Subscribe to Events
```javascript
const socket = io('ws://localhost:9104', {
  path: '/geoagent/socket.io'
});

// Subscribe to location updates
socket.emit('subscribe:tracking', { asset_id: 'asset-123' });

// Listen for updates
socket.on('location:update', (data) => {
  console.log('Location updated:', data);
});

// Listen for geofence triggers
socket.on('geofence:trigger', (data) => {
  console.log('Geofence triggered:', data);
});
```

### Event Types
- `location:update` - Real-time location updates
- `geofence:trigger` - Geofence entry/exit events
- `job:progress` - Processing job progress
- `layer:update` - Layer data changes
- `feature:update` - Feature modifications

## Example Usage

### 1. Create a Layer
```bash
curl -X POST http://localhost:9103/api/v1/layers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "City Assets",
    "description": "Municipal infrastructure assets",
    "data_type": "points",
    "tenant_id": "00000000-0000-0000-0000-000000000000"
  }'
```

### 2. Add Features
```bash
curl -X POST http://localhost:9103/api/v1/features \
  -H "Content-Type: application/json" \
  -d '{
    "layer_id": "layer-id-here",
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "properties": {
      "name": "Asset 001",
      "type": "sensor",
      "status": "active"
    }
  }'
```

### 3. Proximity Search
```bash
curl -X POST http://localhost:9103/api/v1/spatial/proximity \
  -H "Content-Type: application/json" \
  -d '{
    "center": {
      "type": "Point",
      "coordinates": [-6.26, 53.35]
    },
    "radius": 1000,
    "limit": 10
  }'
```

### 4. Create Geofence
```bash
curl -X POST http://localhost:9103/api/v1/geofencing/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Restricted Area",
    "boundary": {
      "type": "Polygon",
      "coordinates": [[
        [-6.27, 53.34],
        [-6.25, 53.34],
        [-6.25, 53.36],
        [-6.27, 53.36],
        [-6.27, 53.34]
      ]]
    },
    "trigger_on_enter": true,
    "trigger_on_exit": true
  }'
```

## MCP Tool Integration

GeoAgent provides **22 MCP tools** for Nexus operations (7 core + 15 HyperModal):

### Core GeoAgent Tools (7 Tools)
- `geo_proximity_search` - Find features within radius
- `geo_spatial_join` - Join data based on spatial relationships
- `geo_route_optimization` - Optimize routes between points
- `geo_heatmap_analysis` - Generate spatial heatmaps
- `geo_geofence_monitor` - Monitor geofence triggers
- `geo_trajectory_analysis` - Analyze movement patterns
- `geo_h3_aggregate` - Aggregate data to H3 grid

### HyperModal Tools (✅ NEW: 15 Tools)

#### Data Ingestion
- `nexus_hypermodal_ingest` - Ingest multi-modal data (LiDAR, hyperspectral, thermal, SAR)

#### LiDAR Processing
- `nexus_hypermodal_process_lidar` - Generate DEM/DSM/CHM, classify ground, extract objects
- `nexus_hypermodal_pointcloud` - 3D point cloud segmentation and classification
- `nexus_hypermodal_elevation` - Terrain analysis (slope, aspect, viewshed, contours)

#### Hyperspectral Analysis
- `nexus_hypermodal_spectral_analysis` - Material identification and classification
- `nexus_hypermodal_vegetation` - Calculate vegetation indices (NDVI, EVI, etc.)
- `nexus_hypermodal_unmix` - Spectral unmixing for material abundance

#### Thermal & SAR
- `nexus_hypermodal_thermal_analysis` - Heat mapping and anomaly detection
- `nexus_hypermodal_sar_processing` - InSAR, coherence, change detection

#### Analysis & Detection
- `nexus_hypermodal_detect_objects` - Object detection in geospatial imagery
- `nexus_hypermodal_change_detection` - Multi-temporal change detection

#### Advanced Features
- `nexus_hypermodal_fusion` - Multi-modal data fusion
- `nexus_hypermodal_stream` - Real-time stream processing
- `nexus_hypermodal_report` - Comprehensive report generation
- `nexus_hypermodal_job_status` - Job status and management

### Using MCP Tools
```typescript
// Core GeoAgent Tool
const result = await mcp.call('geo_proximity_search', {
  center: [-6.26, 53.35],
  radius: 1000,
  layer: 'assets'
});

// HyperModal Tool (LiDAR Processing)
const lidarResult = await mcp.call('nexus_hypermodal_process_lidar', {
  dataset_id: 'dataset_abc123',
  operations: ['dem', 'dsm', 'chm', 'classify_ground'],
  resolution: 0.5,
  output_format: 'geotiff'
});
```

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=9103
WS_PORT=9104
NODE_ENV=production
LOG_LEVEL=info

# PostgreSQL/PostGIS
POSTGRES_HOST=nexus-postgres
POSTGRES_PORT=5432
POSTGRES_DATABASE=unified_nexus
POSTGRES_USER=unified_nexus
POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>
POSTGRES_SCHEMA=geoagent

# Redis
REDIS_HOST=nexus-redis
REDIS_PORT=6379

# Service Integration
GRAPHRAG_URL=http://nexus-graphrag:8090
MAGEAGENT_URL=http://nexus-mageagent:8080
QDRANT_URL=http://nexus-qdrant:6333
NEO4J_URI=bolt://nexus-neo4j:7687

# H3 Configuration
H3_DEFAULT_RESOLUTION=9
ENABLE_H3=true

# Feature Flags
ENABLE_WEBSOCKET=true
ENABLE_CACHING=true
ENABLE_METRICS=true
```

## Performance

### Optimization Tips
1. **Use spatial indexes**: All geometric columns are automatically indexed with GIST
2. **H3 for aggregation**: Use H3 grid for efficient spatial aggregation
3. **Batch operations**: Use bulk endpoints for multiple features
4. **WebSocket for real-time**: Use WebSocket connections for tracking
5. **Caching**: Enable Redis caching for frequently accessed data

### Benchmarks
- Proximity search: <100ms for 10k features
- H3 aggregation: <500ms for 100k points
- WebSocket latency: <50ms per update
- File ingestion: >10k features/second

## Development

### Running Locally

1. **Install dependencies**:
```bash
cd services/geoagent/api
npm install

cd ../worker
go mod download
```

2. **Run migrations**:
```bash
cd services/geoagent/api
npm run migrate
```

3. **Start services**:
```bash
# Terminal 1 - API
cd services/geoagent/api
npm run dev

# Terminal 2 - Worker
cd services/geoagent/worker
go run cmd/worker/main.go
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Monitoring

### Health Check
```bash
curl http://localhost:9103/health
```

### Metrics Endpoint
```bash
curl http://localhost:9097/metrics
```

### Logs
```bash
# API logs
docker logs nexus-geoagent-api

# Worker logs
docker logs nexus-geoagent-worker
```

## Troubleshooting

### PostGIS Not Available
```bash
# Install PostGIS extension
docker exec -it nexus-postgres psql -U unified_nexus -d unified_nexus
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
\q
```

### Migration Failed
```bash
# Run migrations manually
docker exec -it nexus-geoagent-api npm run migrate
```

### Connection Issues
```bash
# Check network
docker network ls | grep nexus

# Inspect network
docker network inspect nexus-network
```

## Security

### Location Privacy
- **Differential privacy**: Add noise to location data
- **K-anonymity**: Ensure minimum group size
- **Geohashing**: Use approximate locations
- **Access control**: Spatial permission boundaries

### Best Practices
1. Always use HTTPS in production
2. Implement API key authentication
3. Use tenant isolation for multi-tenancy
4. Enable audit logging for compliance
5. Regularly backup spatial data

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: https://github.com/adverant/Adverant-Nexus/issues
- Documentation: https://github.com/adverant/Adverant-Nexus/tree/main/services/nexus-geoagent#readme

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

---

**GeoAgent** - Bringing spatial intelligence to the Unified Nexus Stack 🗺️🧠