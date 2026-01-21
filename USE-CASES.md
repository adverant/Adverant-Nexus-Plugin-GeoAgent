# GeoAgent Use Cases

Practical examples of GeoAgent capabilities based on actual API endpoints.

## Core Geospatial Operations

### 1. Layer Management

Organize spatial data into logical collections.

```bash
# Create a layer for tracking assets
curl -X POST http://localhost:9103/api/v1/layers \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-001" \
  -d '{
    "layer_name": "Fleet Vehicles",
    "layer_type": "points",
    "visibility": true,
    "metadata": {
      "category": "transportation",
      "refresh_rate": "realtime"
    }
  }'

# List all layers
curl http://localhost:9103/api/v1/layers \
  -H "x-tenant-id: tenant-001"

# Update layer visibility
curl -X PUT http://localhost:9103/api/v1/layers/{layer_id} \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-001" \
  -d '{"visibility": false}'
```

### 2. Feature Management

Store and query geospatial features with GeoJSON geometry.

```bash
# Add a single feature
curl -X POST http://localhost:9103/api/v1/features \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-001" \
  -d '{
    "layer_id": "layer-uuid",
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "properties": {
      "name": "Warehouse A",
      "capacity": 5000,
      "status": "operational"
    }
  }'

# Batch insert features
curl -X POST http://localhost:9103/api/v1/features/batch \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-001" \
  -d '{
    "layer_id": "layer-uuid",
    "features": [
      {
        "geometry": {"type": "Point", "coordinates": [-6.25, 53.35]},
        "properties": {"name": "Site 1"}
      },
      {
        "geometry": {"type": "Point", "coordinates": [-6.27, 53.34]},
        "properties": {"name": "Site 2"}
      }
    ]
  }'

# Query features by bounding box
curl "http://localhost:9103/api/v1/features?layer_id=layer-uuid&bbox=-6.5,53.0,-6.0,54.0&limit=100" \
  -H "x-tenant-id: tenant-001"

# Query features by properties
curl "http://localhost:9103/api/v1/features?properties={\"status\":\"operational\"}" \
  -H "x-tenant-id: tenant-001"
```

### 3. Spatial Buffer Operations

Create buffer zones around geometries.

```bash
# Create 500m buffer around a point
curl -X POST http://localhost:9103/api/v1/spatial/buffer \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "distance": 500,
    "units": "meters"
  }'

# Create 2km buffer
curl -X POST http://localhost:9103/api/v1/spatial/buffer \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "distance": 2,
    "units": "kilometers"
  }'
```

### 4. H3 Hexagonal Grid Operations

Convert coordinates to H3 hexagonal cell indexes.

```bash
# Convert point to H3 cell at resolution 9
curl -X POST http://localhost:9103/api/v1/h3/point-to-cell \
  -H "Content-Type: application/json" \
  -d '{
    "point": {
      "type": "Point",
      "coordinates": [-6.2603, 53.3498]
    },
    "resolution": 9
  }'
```

H3 resolutions provide different precision levels:
- Resolution 7: ~5.16 km edge length (regional analysis)
- Resolution 9: ~174 m edge length (neighborhood analysis)
- Resolution 11: ~24 m edge length (building-level precision)
- Resolution 12: ~9 m edge length (precise positioning)

### 5. Geofencing

Monitor entry/exit events for defined boundaries.

```bash
# List active geofences
curl http://localhost:9103/api/v1/geofencing \
  -H "x-tenant-id: tenant-001"
```

Geofence types:
- **static**: Fixed boundary (warehouse, city limits)
- **dynamic**: Moving boundary (convoy protection zone)
- **temporal**: Time-bound boundary (event perimeter)

### 6. Asset Tracking

Track moving assets with location history.

```bash
# Get asset location history
curl http://localhost:9103/api/v1/tracking/assets/asset-123/locations \
  -H "x-tenant-id: tenant-001"
```

Location data includes:
- GPS coordinates
- Speed (km/h)
- Heading (degrees)
- Timestamp
- H3 index for efficient spatial queries

### 7. File Ingestion

Import geospatial data from various formats.

```bash
# Upload a GeoJSON file for processing
curl -X POST http://localhost:9103/api/v1/ingestion/upload \
  -H "Content-Type: application/json" \
  -d '{
    "format": "geojson",
    "layer_id": "layer-uuid",
    "data": "{\"type\":\"FeatureCollection\",\"features\":[]}"
  }'
```

Supported formats:
- GeoJSON (.geojson)
- KML/KMZ (.kml, .kmz)
- Shapefile (.shp)
- GPX (.gpx)
- CSV with coordinates (.csv)

---

## HyperModal Processing

Advanced multi-modal geospatial analysis capabilities.

### 8. LiDAR Processing

Process LAS/LAZ point cloud data.

```bash
# Ingest a LiDAR file
curl -X POST http://localhost:9103/api/v1/hypermodal/lidar/ingest \
  -F "file=@pointcloud.las" \
  -F "metadata={\"source\":\"drone-survey\",\"date\":\"2024-11-04\"}"

# Process LiDAR data (DEM/DSM/CHM generation)
curl -X POST http://localhost:9103/api/v1/hypermodal/lidar/process \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "operations": ["dem", "dsm", "chm", "classify_ground"],
    "resolution": 0.5,
    "output_format": "geotiff"
  }'

# Check processing status
curl http://localhost:9103/api/v1/hypermodal/jobs/{jobId}
```

LiDAR operations:
- **dem**: Digital Elevation Model (bare earth)
- **dsm**: Digital Surface Model (with buildings/trees)
- **chm**: Canopy Height Model (vegetation height)
- **classify_ground**: Ground point classification
- **extract_buildings**: Building footprint extraction
- **extract_vegetation**: Vegetation extraction

### 9. Hyperspectral Analysis

Analyze multi-band spectral imagery.

```bash
# Ingest hyperspectral data
curl -X POST http://localhost:9103/api/v1/hypermodal/spectral/ingest \
  -F "file=@hyperspectral.hdf5"

# Perform spectral unmixing
curl -X POST http://localhost:9103/api/v1/hypermodal/spectral/unmix \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "algorithm": "fcls"
  }'

# Calculate vegetation indices
curl -X POST http://localhost:9103/api/v1/hypermodal/spectral/vegetation \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "indices": ["ndvi", "evi", "savi", "ndwi"],
    "crop_type": "wheat",
    "growth_stage": "flowering"
  }'

# Material identification
curl -X POST http://localhost:9103/api/v1/hypermodal/spectral/identify \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "spectral_library": "usgs"
  }'

# Mineral mapping
curl -X POST http://localhost:9103/api/v1/hypermodal/spectral/minerals \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "spectral_library": "usgs",
    "target_minerals": ["iron_oxide", "clay", "carbite"]
  }'
```

Unmixing algorithms:
- **nnls**: Non-Negative Least Squares
- **fcls**: Fully Constrained Least Squares
- **vca**: Vertex Component Analysis
- **n-findr**: N-FINDR endmember extraction

Vegetation indices:
- **ndvi**: Normalized Difference Vegetation Index
- **evi**: Enhanced Vegetation Index
- **savi**: Soil Adjusted Vegetation Index
- **ndwi**: Normalized Difference Water Index
- **gndvi**: Green NDVI
- **reci**: Red Edge Chlorophyll Index
- **cvi**: Chlorophyll Vegetation Index
- **lai**: Leaf Area Index

Spectral libraries:
- **usgs**: USGS Spectral Library
- **aster**: ASTER Spectral Library
- **custom**: User-provided library

### 10. Thermal Imaging

Analyze thermal infrared imagery.

```bash
# Ingest thermal imagery
curl -X POST http://localhost:9103/api/v1/hypermodal/thermal/ingest \
  -F "file=@thermal.tiff"

# Generate heat map
curl -X POST http://localhost:9103/api/v1/hypermodal/thermal/heatmap \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "temperature_range": {"min": 15, "max": 45}
  }'

# Detect thermal anomalies
curl -X POST http://localhost:9103/api/v1/hypermodal/thermal/anomaly \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "detection_threshold": 2.0,
    "temperature_range": {"min": 20, "max": 40}
  }'

# Extract temperature data
curl -X POST http://localhost:9103/api/v1/hypermodal/thermal/extract \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "extraction_type": "temperature",
    "roi": {
      "type": "Polygon",
      "coordinates": [[[-6.27, 53.34], [-6.25, 53.34], [-6.25, 53.36], [-6.27, 53.36], [-6.27, 53.34]]]
    }
  }'
```

### 11. SAR Processing

Synthetic Aperture Radar analysis.

```bash
# Ingest SAR data
curl -X POST http://localhost:9103/api/v1/hypermodal/sar/ingest \
  -F "file=@sar_data.tiff"

# InSAR interferometry
curl -X POST http://localhost:9103/api/v1/hypermodal/sar/interferometry \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "dataset-uuid",
    "reference_date": "2024-01-01",
    "secondary_date": "2024-06-01"
  }'

# Coherence calculation
curl -X POST http://localhost:9103/api/v1/hypermodal/sar/coherence \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "dataset-uuid"}'

# Change detection
curl -X POST http://localhost:9103/api/v1/hypermodal/sar/change \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "dataset-uuid"}'
```

### 12. Multi-Modal Fusion

Combine multiple data types for comprehensive analysis.

```bash
# Fuse LiDAR + thermal + hyperspectral
curl -X POST http://localhost:9103/api/v1/hypermodal/fusion/multimodal \
  -H "Content-Type: application/json" \
  -d '{
    "datasets": [
      {"id": "lidar-dataset-uuid", "type": "lidar"},
      {"id": "thermal-dataset-uuid", "type": "thermal"},
      {"id": "spectral-dataset-uuid", "type": "spectral"}
    ],
    "fusion_method": "feature_level"
  }'

# Generate comprehensive report
curl -X POST http://localhost:9103/api/v1/hypermodal/fusion/report \
  -H "Content-Type: application/json" \
  -d '{
    "fusion_job_id": "fusion-uuid",
    "report_type": "comprehensive"
  }'
```

Fusion methods:
- **pixel_level**: Combine at pixel resolution
- **feature_level**: Extract features then combine
- **decision_level**: Combine analysis results

---

## Real-Time WebSocket Events

### Subscribe to Asset Tracking

```javascript
const socket = io('ws://localhost:9104', {
  path: '/geoagent/socket.io'
});

// Subscribe to specific asset
socket.emit('subscribe:tracking', { asset_id: 'vehicle-001' });

// Listen for location updates
socket.on('location:update', (data) => {
  console.log('New location:', data.location);
  console.log('Speed:', data.speed, 'km/h');
  console.log('Heading:', data.heading, 'degrees');
});

// Listen for geofence triggers
socket.on('geofence:trigger', (data) => {
  console.log('Geofence:', data.geofence_name);
  console.log('Event:', data.trigger_type); // enter, exit, dwell
});

// Listen for job progress
socket.on('job:progress', (data) => {
  console.log('Job:', data.job_id);
  console.log('Progress:', data.progress, '%');
});
```

---

## Industry Applications

### Fleet Management
- Real-time vehicle tracking with <50ms latency
- Route optimization using H3 grid aggregation
- Geofence alerts for delivery zones

### Precision Agriculture
- NDVI/EVI vegetation health monitoring
- LiDAR-based crop height analysis
- Thermal anomaly detection for irrigation issues

### Urban Planning
- Building extraction from LiDAR
- Heatmap analysis for population density
- Spatial clustering for service placement

### Environmental Monitoring
- Multi-temporal change detection with SAR
- Hyperspectral material identification
- Thermal mapping for urban heat islands

### Mining and Exploration
- Mineral mapping with spectral analysis
- DEM/DSM generation for terrain analysis
- Ground deformation monitoring with InSAR
