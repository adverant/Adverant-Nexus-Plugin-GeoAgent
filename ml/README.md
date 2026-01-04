# GeoAgent ML Service

Machine learning service for advanced geospatial data processing, providing ML-based analysis for LiDAR, hyperspectral, SAR, and thermal imagery.

## Features

### LiDAR Processing
- **Point Cloud Classification**: Deep learning classification of point clouds into ground, vegetation, buildings, water, etc.
- **Object Segmentation**: Detection and segmentation of individual trees, buildings, vehicles, power lines

### Hyperspectral Analysis
- **Material Identification**: Identify vegetation types, minerals, water quality indicators, man-made materials
- **Spectral Unmixing**: Neural network-based decomposition of mixed spectra into pure endmembers

### Thermal Imaging
- **Anomaly Detection**: Detect heat sources, temperature anomalies, thermal leaks, hot spots
- **Thermal Segmentation**: Segment imagery into temperature zones and heat distribution patterns

### SAR Processing
- **Change Detection**: ML-based detection of changes in urban development, deforestation, flooding, infrastructure

## Architecture

```
GeoAgent ML Service
├── FastAPI Application (Python 3.11)
├── PyTorch Models (Deep Learning)
├── Redis (Caching)
└── Integration with:
    ├── GraphRAG (Knowledge Storage)
    ├── MageAgent (Multi-Agent Orchestration)
    └── MinIO (Object Storage)
```

## API Endpoints

### Health & Status
- `GET /health` - Health check with model status
- `GET /` - Service information

### LiDAR
- `POST /lidar/classify` - Classify point cloud data
- `POST /lidar/segment` - Segment objects from point clouds

### Hyperspectral
- `POST /spectral/identify` - Identify materials
- `POST /spectral/unmix` - ML-based spectral unmixing

### Thermal
- `POST /thermal/detect_anomalies` - Detect thermal anomalies
- `POST /thermal/segment` - Segment thermal regions

### SAR
- `POST /sar/change_detection` - Detect changes in SAR imagery

## Installation

### Docker (Recommended)
```bash
# Build
docker build -t adverant/nexus-geoagent-ml:latest .

# Run
docker run -p 5001:5001 \
  -e REDIS_URL=redis://localhost:6379 \
  -e MODEL_PATH=/app/models \
  adverant/nexus-geoagent-ml:latest
```

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run application
uvicorn app.main:app --reload --port 5001
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `5001` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `MODEL_PATH` | Path to pretrained models | `/app/models` |
| `TEMP_DIR` | Temporary processing directory | `/tmp/geoagent-ml` |
| `LOG_LEVEL` | Logging level | `info` |
| `GRAPHRAG_URL` | GraphRAG endpoint | `http://nexus-graphrag:8090` |
| `MAGEAGENT_URL` | MageAgent endpoint | `http://nexus-mageagent:8080` |

## Dependencies

### Core
- FastAPI 0.104.1
- PyTorch 2.1.0
- NumPy 1.24.3
- SciPy 1.11.3

### Geospatial
- rasterio 1.3.9
- laspy 2.5.1
- h5py 3.10.0
- GDAL (via libgdal-dev)

### Processing
- OpenCV 4.8.1
- scikit-learn 1.3.2
- spectral 0.23.1

## Model Storage

Pretrained models are stored in `/app/models` directory:
- LiDAR classification models
- Spectral unmixing networks
- Thermal anomaly detection models
- SAR change detection models

Models are loaded on service startup and cached in memory for fast inference.

## Integration with Unified Nexus Stack

### GraphRAG Storage
All analysis results are automatically stored in GraphRAG:
```python
# Analysis results → GraphRAG documents
# Detected objects → GraphRAG entities
# Processing events → GraphRAG episodes
```

### MageAgent Orchestration
Complex multi-modal analysis can be orchestrated through MageAgent:
```python
# Multi-agent workflows
# Cross-domain analysis
# Consensus-based validation
```

### MinIO Object Storage
Large geospatial files are stored in MinIO:
```python
# Input: MinIO bucket (raw data)
# Processing: Local temp directory
# Output: MinIO bucket (processed results)
```

## Performance

| Operation | Data Size | Processing Time | Hardware |
|-----------|-----------|-----------------|----------|
| LiDAR Classification | 100M points | <30 seconds | CPU (4 cores) |
| LiDAR Classification | 100M points | <5 seconds | GPU (CUDA) |
| Spectral Unmixing | 1000×1000×224 | <20 seconds | CPU |
| Thermal Anomaly | 4K image | <2 seconds | CPU |

## Development

### Adding New Models

1. Create processor in `app/processors/`:
```python
# app/processors/new_processor.py
class NewProcessor:
    def __init__(self, model_path: str):
        self.model = load_model(model_path)

    def process(self, data):
        return self.model.predict(data)
```

2. Add endpoint in `app/main.py`:
```python
@app.post("/new/endpoint")
async def new_operation(data: ProcessingRequest):
    processor = NewProcessor(MODEL_PATH)
    result = processor.process(data)
    return ProcessingResponse(success=True, result=result)
```

3. Update health check to include model status

### Testing

```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# Load tests
locust -f tests/load/locustfile.py
```

## Troubleshooting

### Service Won't Start
- Check Redis connection: `redis-cli ping`
- Verify GDAL installation: `gdalinfo --version`
- Check port availability: `lsof -i :5001`

### Out of Memory
- Reduce batch size in model inference
- Increase Docker memory limit
- Process data in chunks

### Slow Processing
- Enable GPU acceleration (CUDA)
- Increase worker count in uvicorn
- Use model quantization for faster inference

## License

Part of the Unified Nexus Stack - Proprietary

## Contact

For issues and questions, refer to the main Unified Nexus Stack documentation.
