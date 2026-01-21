# GeoAgent Technical Documentation

## Overview

GeoAgent provides comprehensive geospatial intelligence capabilities for the Nexus platform. This document covers API specifications, authentication, rate limits, and integration patterns for developers building location-aware applications.

**Base URLs**
| Service | URL |
|---------|-----|
| HTTP API | `http://localhost:9103` |
| WebSocket | `ws://localhost:9104` |
| Worker Metrics | `http://localhost:9105/metrics` |
| MinIO API | `http://localhost:9106` |
| MinIO Console | `http://localhost:9107` |
| ML Service | `http://localhost:9108` |

---

## Authentication

### API Key Authentication

All API requests require authentication via API key in the request header.

```http
Authorization: Bearer <your-api-key>
X-Tenant-ID: <tenant-uuid>
```

### Multi-Tenancy

GeoAgent supports multi-tenant deployments with row-level security. Include the tenant identifier in all requests:

```json
{
  "tenant_id": "00000000-0000-0000-0000-000000000000"
}
```

### Security Considerations

- **Differential Privacy**: Supports adding noise to location data for privacy protection
- **K-Anonymity**: Ensures minimum group size for location queries
- **Geohashing**: Provides approximate location support for privacy-sensitive applications
- **Access Control**: Spatial permission boundaries per tenant

---

## Rate Limits and Quotas

### Free Tier

| Resource | Limit |
|----------|-------|
| API Requests | 1,000/day |
| Features per Layer | 10,000 |
| WebSocket Connections | 5 concurrent |
| File Upload Size | 50 MB |
| HyperModal Processing | 100 MB/month |

### Standard Tier

| Resource | Limit |
|----------|-------|
| API Requests | 100,000/day |
| Features per Layer | 1,000,000 |
| WebSocket Connections | 100 concurrent |
| File Upload Size | 1 GB |
| HyperModal Processing | 10 GB/month |

### Rate Limit Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1699200000
```

---

## Request/Response Formats

### Standard Request Headers

```http
Content-Type: application/json
Authorization: Bearer <api-key>
X-Tenant-ID: <tenant-uuid>
X-Request-ID: <optional-trace-id>
```

### Standard Response Format

**Success Response**
```json
{
  "success": true,
  "data": { },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-11-05T12:00:00Z",
    "processing_time_ms": 45
  }
}
```

**Error Response**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_GEOMETRY",
    "message": "Invalid GeoJSON geometry provided",
    "details": {
      "field": "geometry",
      "expected": "Valid GeoJSON Point, Polygon, or MultiPolygon"
    }
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-11-05T12:00:00Z"
  }
}
```

---

## API Reference

### Layers API

Layers organize geospatial features into logical collections.

#### List Layers

```http
GET /api/v1/layers
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Maximum results (default: 50, max: 100) |
| `offset` | integer | Pagination offset |
| `data_type` | string | Filter by type: `points`, `lines`, `polygons` |

**Response**
```json
{
  "success": true,
  "data": {
    "layers": [
      {
        "id": "layer_abc123",
        "name": "City Assets",
        "description": "Municipal infrastructure assets",
        "data_type": "points",
        "feature_count": 1542,
        "created_at": "2025-11-01T10:00:00Z",
        "updated_at": "2025-11-05T14:30:00Z"
      }
    ],
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

#### Create Layer

```http
POST /api/v1/layers
```

**Request Body**
```json
{
  "name": "City Assets",
  "description": "Municipal infrastructure assets",
  "data_type": "points",
  "tenant_id": "00000000-0000-0000-0000-000000000000"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": "layer_abc123",
    "name": "City Assets",
    "description": "Municipal infrastructure assets",
    "data_type": "points",
    "feature_count": 0,
    "created_at": "2025-11-05T12:00:00Z"
  }
}
```

#### Get Layer

```http
GET /api/v1/layers/:id
```

#### Update Layer

```http
PUT /api/v1/layers/:id
```

#### Delete Layer

```http
DELETE /api/v1/layers/:id
```

---

### Features API

Features represent individual geospatial entities with geometry and properties.

#### List Features

```http
GET /api/v1/features
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `layer_id` | uuid | Filter by layer |
| `bbox` | string | Bounding box filter: `minLon,minLat,maxLon,maxLat` |
| `limit` | integer | Maximum results (default: 100, max: 1000) |

#### Create Feature

```http
POST /api/v1/features
```

**Request Body**
```json
{
  "layer_id": "layer_abc123",
  "geometry": {
    "type": "Point",
    "coordinates": [-6.2603, 53.3498]
  },
  "properties": {
    "name": "Asset 001",
    "type": "sensor",
    "status": "active"
  }
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": "feature_xyz789",
    "layer_id": "layer_abc123",
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "properties": {
      "name": "Asset 001",
      "type": "sensor",
      "status": "active"
    },
    "created_at": "2025-11-05T12:00:00Z"
  }
}
```

#### Get Feature

```http
GET /api/v1/features/:id
```

#### Update Feature

```http
PUT /api/v1/features/:id
```

#### Delete Feature

```http
DELETE /api/v1/features/:id
```

---

### Spatial Operations API

#### Proximity Search

Find features within a specified radius.

```http
POST /api/v1/spatial/proximity
```

**Request Body**
```json
{
  "center": {
    "type": "Point",
    "coordinates": [-6.26, 53.35]
  },
  "radius": 1000,
  "unit": "meters",
  "layer_id": "layer_abc123",
  "limit": 10
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "features": [
      {
        "id": "feature_xyz789",
        "geometry": {
          "type": "Point",
          "coordinates": [-6.2603, 53.3498]
        },
        "properties": {
          "name": "Asset 001"
        },
        "distance_meters": 245.7
      }
    ],
    "count": 1
  },
  "meta": {
    "processing_time_ms": 45
  }
}
```

**Performance**: Less than 100ms for 10,000 features

#### Within Polygon

```http
POST /api/v1/spatial/within
```

**Request Body**
```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[
      [-6.27, 53.34],
      [-6.25, 53.34],
      [-6.25, 53.36],
      [-6.27, 53.36],
      [-6.27, 53.34]
    ]]
  },
  "layer_id": "layer_abc123"
}
```

#### Buffer Zone

```http
POST /api/v1/spatial/buffer
```

**Request Body**
```json
{
  "geometry": {
    "type": "Point",
    "coordinates": [-6.26, 53.35]
  },
  "distance": 500,
  "unit": "meters"
}
```

#### Intersection

```http
POST /api/v1/spatial/intersection
```

#### Heatmap Generation

```http
POST /api/v1/spatial/heatmap
```

**Request Body**
```json
{
  "layer_id": "layer_abc123",
  "resolution": 9,
  "bounds": {
    "min_lon": -6.3,
    "min_lat": 53.3,
    "max_lon": -6.2,
    "max_lat": 53.4
  }
}
```

#### Spatial Clustering

```http
POST /api/v1/spatial/clustering
```

**Request Body**
```json
{
  "layer_id": "layer_abc123",
  "algorithm": "dbscan",
  "params": {
    "eps": 100,
    "min_samples": 5
  }
}
```

---

### Real-time Tracking API

#### Update Asset Location

```http
POST /api/v1/tracking/update
```

**Request Body**
```json
{
  "asset_id": "asset-123",
  "location": {
    "type": "Point",
    "coordinates": [-6.2603, 53.3498]
  },
  "timestamp": "2025-11-05T12:00:00Z",
  "metadata": {
    "speed": 45.2,
    "heading": 180,
    "accuracy": 5
  }
}
```

**Performance**: WebSocket latency less than 50ms per update

#### Get Asset Trajectory

```http
GET /api/v1/tracking/assets/:id
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start_time` | ISO8601 | Trajectory start time |
| `end_time` | ISO8601 | Trajectory end time |
| `simplify` | boolean | Apply Douglas-Peucker simplification |

#### Analyze Trajectory

```http
POST /api/v1/tracking/analyze
```

**Request Body**
```json
{
  "asset_id": "asset-123",
  "start_time": "2025-11-05T00:00:00Z",
  "end_time": "2025-11-05T23:59:59Z",
  "analysis_types": ["stops", "speed", "distance"]
}
```

---

### Geofencing API

#### Create Geofence

```http
POST /api/v1/geofencing/create
```

**Request Body**
```json
{
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
  "trigger_on_exit": true,
  "trigger_on_dwell": true,
  "dwell_time_seconds": 300
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": "geofence_abc123",
    "name": "Restricted Area",
    "status": "active",
    "triggers": ["enter", "exit", "dwell"],
    "created_at": "2025-11-05T12:00:00Z"
  }
}
```

#### List Active Geofences

```http
GET /api/v1/geofencing/active
```

#### Check Geofence Triggers

```http
POST /api/v1/geofencing/check
```

**Request Body**
```json
{
  "asset_id": "asset-123",
  "location": {
    "type": "Point",
    "coordinates": [-6.26, 53.35]
  }
}
```

---

### H3 Grid Operations API

H3 provides multi-resolution spatial indexing using Uber's hexagonal hierarchical spatial index.

#### Aggregate to H3 Grid

```http
POST /api/v1/h3/aggregate
```

**Request Body**
```json
{
  "layer_id": "layer_abc123",
  "resolution": 9,
  "aggregation": "count",
  "bounds": {
    "min_lon": -6.3,
    "min_lat": 53.3,
    "max_lon": -6.2,
    "max_lat": 53.4
  }
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "hexagons": [
      {
        "h3_index": "891f8a8c6a3ffff",
        "value": 42,
        "center": [-6.255, 53.345]
      }
    ],
    "resolution": 9,
    "total_hexagons": 156
  },
  "meta": {
    "processing_time_ms": 320
  }
}
```

**Performance**: Less than 500ms for 100,000 points

#### Hierarchical Rollup

```http
POST /api/v1/h3/rollup
```

**Request Body**
```json
{
  "layer_id": "layer_abc123",
  "base_resolution": 9,
  "target_resolution": 7
}
```

#### Get H3 Neighbors

```http
GET /api/v1/h3/neighbors
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `h3_index` | string | H3 cell index |
| `k` | integer | Ring distance (default: 1) |

---

### File Ingestion API

Supports GeoJSON, KML, Shapefile, GPX, and CSV formats.

#### Upload File

```http
POST /api/v1/ingestion/upload
Content-Type: multipart/form-data
```

**Form Fields**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | Geospatial file |
| `layer_id` | uuid | Target layer (optional, creates new if omitted) |
| `format` | string | File format hint: `geojson`, `kml`, `shp`, `gpx`, `csv` |
| `csv_lat_column` | string | Latitude column name (CSV only) |
| `csv_lon_column` | string | Longitude column name (CSV only) |

**Response**
```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123",
    "status": "processing",
    "layer_id": "layer_xyz789"
  }
}
```

**Performance**: Greater than 10,000 features/second ingestion rate

#### Ingest from URL

```http
POST /api/v1/ingestion/url
```

**Request Body**
```json
{
  "url": "https://example.com/data.geojson",
  "layer_id": "layer_abc123"
}
```

#### Check Ingestion Status

```http
GET /api/v1/ingestion/jobs/:id
```

**Response**
```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123",
    "status": "completed",
    "features_processed": 15420,
    "duration_seconds": 1.5,
    "layer_id": "layer_abc123"
  }
}
```

---

### HyperModal API

Advanced multi-modal geospatial processing capabilities.

#### LiDAR Processing

##### Ingest LiDAR Data

```http
POST /api/v1/hypermodal/lidar/ingest
Content-Type: multipart/form-data
```

**Form Fields**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | LAS or LAZ file |
| `name` | string | Dataset name |
| `crs` | string | Coordinate reference system (e.g., `EPSG:4326`) |

**Response**
```json
{
  "success": true,
  "data": {
    "dataset_id": "dataset_abc123",
    "point_count": 100000000,
    "bounds": {
      "min_x": -6.3,
      "min_y": 53.3,
      "max_x": -6.2,
      "max_y": 53.4
    },
    "storage_path": "s3://geoagent/lidar/dataset_abc123"
  }
}
```

##### Process LiDAR

```http
POST /api/v1/hypermodal/lidar/process
```

**Request Body**
```json
{
  "dataset_id": "dataset_abc123",
  "operations": ["dem", "dsm", "chm"],
  "resolution": 0.5,
  "output_format": "geotiff"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "job_id": "job_lidar_xyz",
    "status": "processing",
    "estimated_time_seconds": 45
  }
}
```

**Performance**: Less than 45 seconds for DEM generation from 100 million points

##### Ground Classification

```http
POST /api/v1/hypermodal/lidar/classify
```

**Request Body**
```json
{
  "dataset_id": "dataset_abc123",
  "algorithm": "csf",
  "params": {
    "cloth_resolution": 0.5,
    "max_iterations": 500
  }
}
```

**Algorithms**: Cloth Simulation Filter (CSF), DBSCAN clustering

##### Extract Objects

```http
POST /api/v1/hypermodal/lidar/extract
```

**Request Body**
```json
{
  "dataset_id": "dataset_abc123",
  "object_types": ["buildings", "vegetation"],
  "min_height": 2.0
}
```

---

#### Hyperspectral Analysis

##### Ingest Hyperspectral Data

```http
POST /api/v1/hypermodal/spectral/ingest
Content-Type: multipart/form-data
```

**Supported Formats**: HDF5, ENVI

##### Spectral Unmixing

```http
POST /api/v1/hypermodal/spectral/unmix
```

**Request Body**
```json
{
  "dataset_id": "dataset_spectral_123",
  "algorithm": "fcls",
  "endmembers": 5
}
```

**Algorithms**: NMF (Non-negative Matrix Factorization), FCLS (Fully Constrained Least Squares)

**Performance**: Less than 30 seconds for 1000x1000x224 bands spectral unmixing

##### Material Identification

```http
POST /api/v1/hypermodal/spectral/identify
```

**Request Body**
```json
{
  "dataset_id": "dataset_spectral_123",
  "library": "usgs",
  "threshold": 0.85
}
```

**Spectral Libraries**: USGS, ASTER

##### Vegetation Indices

```http
POST /api/v1/hypermodal/spectral/vegetation
```

**Request Body**
```json
{
  "dataset_id": "dataset_spectral_123",
  "indices": ["ndvi", "evi", "savi", "ndwi"]
}
```

**Supported Indices**: NDVI, EVI, SAVI, NDWI, GNDVI, RECI, CVI, LAI

---

#### SAR Processing

##### Ingest SAR Data

```http
POST /api/v1/hypermodal/sar/ingest
```

##### InSAR Processing

```http
POST /api/v1/hypermodal/sar/interferometry
```

**Request Body**
```json
{
  "master_id": "dataset_sar_1",
  "slave_id": "dataset_sar_2",
  "multilook": {
    "range": 2,
    "azimuth": 10
  }
}
```

**Capabilities**: Ground deformation, earthquake monitoring, subsidence mapping

##### Coherence Calculation

```http
POST /api/v1/hypermodal/sar/coherence
```

##### Change Detection

```http
POST /api/v1/hypermodal/sar/change
```

**Filters**: Lee speckle filter, multi-look processing

---

#### Thermal Imaging

##### Ingest Thermal Data

```http
POST /api/v1/hypermodal/thermal/ingest
```

##### Generate Heat Map

```http
POST /api/v1/hypermodal/thermal/heatmap
```

**Request Body**
```json
{
  "dataset_id": "dataset_thermal_123",
  "colormap": "inferno",
  "min_temp": 15,
  "max_temp": 45
}
```

**Performance**: Less than 2 seconds for 4K thermal imagery processing

##### Anomaly Detection

```http
POST /api/v1/hypermodal/thermal/anomaly
```

**Request Body**
```json
{
  "dataset_id": "dataset_thermal_123",
  "threshold_sigma": 2
}
```

**Detection**: Statistical outliers using 2-sigma and 3-sigma thresholds

---

#### Multi-Modal Fusion

##### Fuse Data Sources

```http
POST /api/v1/hypermodal/fusion/multimodal
```

**Request Body**
```json
{
  "datasets": [
    {"id": "dataset_lidar_123", "type": "lidar"},
    {"id": "dataset_spectral_456", "type": "hyperspectral"},
    {"id": "dataset_thermal_789", "type": "thermal"}
  ],
  "fusion_method": "feature_level",
  "output_resolution": 1.0
}
```

**Fusion Methods**: Pixel-level, feature-level, decision-level

**Use Cases**: Precision agriculture, archaeological surveys, disaster assessment

##### Generate Report

```http
POST /api/v1/hypermodal/fusion/report
```

---

#### Job Management

##### Check Job Status

```http
GET /api/v1/hypermodal/jobs/:jobId
```

**Response**
```json
{
  "success": true,
  "data": {
    "job_id": "job_lidar_xyz",
    "status": "completed",
    "progress": 100,
    "result": {
      "output_files": [
        "s3://geoagent/output/dem_dataset_abc123.tif",
        "s3://geoagent/output/dsm_dataset_abc123.tif"
      ]
    },
    "processing_time_seconds": 42
  }
}
```

##### Cancel Job

```http
DELETE /api/v1/hypermodal/jobs/:jobId
```

---

## WebSocket Events

### Connection

```javascript
const socket = io('ws://localhost:9104', {
  path: '/geoagent/socket.io',
  auth: {
    token: '<api-key>'
  }
});
```

### Event Subscriptions

#### Subscribe to Asset Tracking

```javascript
socket.emit('subscribe:tracking', {
  asset_id: 'asset-123'
});

socket.on('location:update', (data) => {
  console.log('Location updated:', data);
  // {
  //   asset_id: 'asset-123',
  //   location: { type: 'Point', coordinates: [-6.26, 53.35] },
  //   timestamp: '2025-11-05T12:00:00Z',
  //   metadata: { speed: 45.2, heading: 180 }
  // }
});
```

#### Subscribe to Geofence Events

```javascript
socket.emit('subscribe:geofence', {
  geofence_id: 'geofence_abc123'
});

socket.on('geofence:trigger', (data) => {
  console.log('Geofence triggered:', data);
  // {
  //   geofence_id: 'geofence_abc123',
  //   asset_id: 'asset-123',
  //   trigger_type: 'enter',
  //   timestamp: '2025-11-05T12:00:00Z',
  //   location: { type: 'Point', coordinates: [-6.26, 53.35] }
  // }
});
```

#### Subscribe to Layer Updates

```javascript
socket.emit('subscribe:layer', {
  layer_id: 'layer_abc123'
});

socket.on('feature:update', (data) => {
  console.log('Feature updated:', data);
});
```

#### Subscribe to Job Progress

```javascript
socket.emit('subscribe:job', {
  job_id: 'job_lidar_xyz'
});

socket.on('job:progress', (data) => {
  console.log('Job progress:', data);
  // {
  //   job_id: 'job_lidar_xyz',
  //   progress: 75,
  //   stage: 'generating_dem',
  //   estimated_remaining_seconds: 12
  // }
});
```

### Event Types Reference

| Event | Description | Payload |
|-------|-------------|---------|
| `location:update` | Real-time location updates | `{asset_id, location, timestamp, metadata}` |
| `geofence:trigger` | Geofence entry/exit/dwell events | `{geofence_id, asset_id, trigger_type, timestamp}` |
| `job:progress` | Processing job progress | `{job_id, progress, stage, estimated_remaining_seconds}` |
| `layer:update` | Layer data changes | `{layer_id, action, feature_count}` |
| `feature:update` | Feature modifications | `{feature_id, layer_id, action, geometry}` |

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_GEOMETRY` | 400 | Invalid GeoJSON geometry |
| `INVALID_COORDINATES` | 400 | Coordinates out of valid range |
| `LAYER_NOT_FOUND` | 404 | Layer does not exist |
| `FEATURE_NOT_FOUND` | 404 | Feature does not exist |
| `GEOFENCE_NOT_FOUND` | 404 | Geofence does not exist |
| `JOB_NOT_FOUND` | 404 | Processing job does not exist |
| `DATASET_NOT_FOUND` | 404 | HyperModal dataset does not exist |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions or tenant mismatch |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `QUOTA_EXCEEDED` | 429 | Monthly quota exceeded |
| `FILE_TOO_LARGE` | 413 | Upload exceeds size limit |
| `UNSUPPORTED_FORMAT` | 415 | File format not supported |
| `PROCESSING_FAILED` | 500 | HyperModal processing error |
| `DATABASE_ERROR` | 500 | Database connection or query error |
| `EXTERNAL_SERVICE_ERROR` | 502 | Integration service unavailable |

### Error Handling Example

```typescript
try {
  const response = await fetch('/api/v1/spatial/proximity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!data.success) {
    switch (data.error.code) {
      case 'INVALID_GEOMETRY':
        console.error('Check GeoJSON format:', data.error.details);
        break;
      case 'RATE_LIMITED':
        const retryAfter = response.headers.get('Retry-After');
        console.log(`Rate limited. Retry after ${retryAfter} seconds`);
        break;
      default:
        console.error('API Error:', data.error.message);
    }
  }
} catch (error) {
  console.error('Network error:', error);
}
```

---

## Performance Benchmarks

| Operation | Benchmark | Dataset Size |
|-----------|-----------|--------------|
| Proximity Search | Less than 100ms | 10,000 features |
| H3 Aggregation | Less than 500ms | 100,000 points |
| WebSocket Latency | Less than 50ms | Per update |
| File Ingestion | Greater than 10,000 features/second | Continuous |
| LiDAR DEM Generation | Less than 45 seconds | 100 million points |
| Hyperspectral Unmixing | Less than 30 seconds | 1000x1000x224 bands |
| Thermal Processing | Less than 2 seconds | 4K imagery |

---

## Integration Examples

### TypeScript/Node.js Client

```typescript
import { GeoAgentClient } from '@adverant/geoagent-sdk';

const client = new GeoAgentClient({
  apiKey: process.env.GEOAGENT_API_KEY,
  baseUrl: 'http://localhost:9103',
  tenantId: '00000000-0000-0000-0000-000000000000'
});

// Create a layer
const layer = await client.layers.create({
  name: 'Fleet Tracking',
  dataType: 'points'
});

// Add a feature
const feature = await client.features.create({
  layerId: layer.id,
  geometry: {
    type: 'Point',
    coordinates: [-6.2603, 53.3498]
  },
  properties: {
    vehicleId: 'truck-001',
    status: 'active'
  }
});

// Proximity search
const nearby = await client.spatial.proximity({
  center: { type: 'Point', coordinates: [-6.26, 53.35] },
  radius: 1000,
  layerId: layer.id
});

console.log(`Found ${nearby.features.length} nearby features`);
```

### Python Client

```python
from geoagent import GeoAgentClient

client = GeoAgentClient(
    api_key=os.environ['GEOAGENT_API_KEY'],
    base_url='http://localhost:9103',
    tenant_id='00000000-0000-0000-0000-000000000000'
)

# Process LiDAR data
job = client.hypermodal.process_lidar(
    dataset_id='dataset_abc123',
    operations=['dem', 'dsm', 'chm'],
    resolution=0.5
)

# Wait for completion
result = client.hypermodal.wait_for_job(job.job_id)
print(f"DEM generated: {result.output_files[0]}")
```

### MCP Tool Integration

```typescript
// Core GeoAgent Tool
const proximityResult = await mcp.call('geo_proximity_search', {
  center: [-6.26, 53.35],
  radius: 1000,
  layer: 'assets'
});

// HyperModal Tool - LiDAR Processing
const lidarResult = await mcp.call('nexus_hypermodal_process_lidar', {
  dataset_id: 'dataset_abc123',
  operations: ['dem', 'dsm', 'chm', 'classify_ground'],
  resolution: 0.5,
  output_format: 'geotiff'
});

// HyperModal Tool - Vegetation Analysis
const vegetationResult = await mcp.call('nexus_hypermodal_vegetation', {
  dataset_id: 'dataset_spectral_123',
  indices: ['ndvi', 'evi', 'lai']
});
```

### cURL Examples

```bash
# Create a layer
curl -X POST http://localhost:9103/api/v1/layers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "City Assets",
    "description": "Municipal infrastructure",
    "data_type": "points",
    "tenant_id": "00000000-0000-0000-0000-000000000000"
  }'

# Proximity search
curl -X POST http://localhost:9103/api/v1/spatial/proximity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "center": {"type": "Point", "coordinates": [-6.26, 53.35]},
    "radius": 1000,
    "limit": 10
  }'

# Create geofence
curl -X POST http://localhost:9103/api/v1/geofencing/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "Warehouse Zone",
    "boundary": {
      "type": "Polygon",
      "coordinates": [[
        [-6.27, 53.34], [-6.25, 53.34],
        [-6.25, 53.36], [-6.27, 53.36],
        [-6.27, 53.34]
      ]]
    },
    "trigger_on_enter": true,
    "trigger_on_exit": true
  }'
```

---

## MCP Tools Reference

GeoAgent provides 22 MCP tools for Nexus integration.

### Core GeoAgent Tools (7 Tools)

| Tool | Description |
|------|-------------|
| `geo_proximity_search` | Find features within radius |
| `geo_spatial_join` | Join data based on spatial relationships |
| `geo_route_optimization` | Optimize routes between points |
| `geo_heatmap_analysis` | Generate spatial heatmaps |
| `geo_geofence_monitor` | Monitor geofence triggers |
| `geo_trajectory_analysis` | Analyze movement patterns |
| `geo_h3_aggregate` | Aggregate data to H3 grid |

### HyperModal Tools (15 Tools)

| Tool | Description |
|------|-------------|
| `nexus_hypermodal_ingest` | Ingest multi-modal data |
| `nexus_hypermodal_process_lidar` | DEM/DSM/CHM generation, ground classification |
| `nexus_hypermodal_pointcloud` | 3D point cloud segmentation |
| `nexus_hypermodal_elevation` | Terrain analysis |
| `nexus_hypermodal_spectral_analysis` | Material identification |
| `nexus_hypermodal_vegetation` | Vegetation index calculation |
| `nexus_hypermodal_unmix` | Spectral unmixing |
| `nexus_hypermodal_thermal_analysis` | Heat mapping and anomaly detection |
| `nexus_hypermodal_sar_processing` | InSAR and change detection |
| `nexus_hypermodal_detect_objects` | Object detection in imagery |
| `nexus_hypermodal_change_detection` | Multi-temporal change detection |
| `nexus_hypermodal_fusion` | Multi-modal data fusion |
| `nexus_hypermodal_stream` | Real-time stream processing |
| `nexus_hypermodal_report` | Comprehensive report generation |
| `nexus_hypermodal_job_status` | Job status and management |

---

## Environment Variables

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
POSTGRES_PASSWORD=<secure-password>
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

# MinIO (HyperModal Storage)
MINIO_ENDPOINT=localhost:9106
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
```

---

## Health Checks

### API Health

```bash
curl http://localhost:9103/health
```

**Response**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "websocket": "running"
  }
}
```

### Worker Metrics

```bash
curl http://localhost:9105/metrics
```

### ML Service Health

```bash
curl http://localhost:9108/health
```

---

## Support

- **Documentation**: [https://docs.adverant.ai/plugins/geoagent](https://docs.adverant.ai/plugins/geoagent)
- **GitHub Issues**: [https://github.com/adverant/Adverant-Nexus/issues](https://github.com/adverant/Adverant-Nexus/issues)
- **Developer Portal**: [https://dashboard.adverant.ai/marketplace](https://dashboard.adverant.ai/marketplace)

---

*GeoAgent is developed by Adverant Inc. and available through the Nexus Marketplace.*
