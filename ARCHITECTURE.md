# GeoAgent Architecture

## System Overview

GeoAgent is a comprehensive geospatial intelligence plugin for the Nexus marketplace, providing spatial operations, real-time tracking, and advanced multi-modal processing capabilities. The architecture follows a microservices pattern with clear separation of concerns across three primary services.

```mermaid
flowchart TB
    subgraph External["External Clients"]
        WebApp["Web Apps"]
        MobileApp["Mobile Clients"]
        MCPClients["MCP Clients"]
    end

    subgraph GeoAgent["GeoAgent Service Cluster"]
        subgraph APILayer["API Layer"]
            API["API:9103"]
            WS["WebSocket:9104"]
        end

        subgraph ProcessingLayer["Processing Layer"]
            Worker["Worker:9105"]
            ML["ML Service:9108"]
        end

        subgraph StorageLayer["Storage Layer"]
            PostGIS["PostGIS DB"]
            MinIO["MinIO:9106-9107"]
            Redis["Redis Cache"]
        end
    end

    subgraph NexusIntegration["Nexus Stack Integration"]
        GraphRAG["GraphRAG:8090"]
        Qdrant["Qdrant:6333"]
        MageAgent["MageAgent:8080"]
        Neo4j["Neo4j:7687"]
        FileProcess["FileProcessAgent"]
    end

    WebApp --> API
    MobileApp --> WS
    MCPClients --> API

    API <--> Worker
    API <--> ML
    WS <--> API

    Worker --> PostGIS
    Worker --> Redis
    API --> PostGIS
    ML --> MinIO
    ML --> PostGIS

    API --> GraphRAG
    API --> Qdrant
    API --> MageAgent
    Worker --> Neo4j
    API --> FileProcess
```

## Component Architecture

### API Service (TypeScript)

The API Service serves as the primary entry point for all client interactions, handling HTTP requests, WebSocket connections, and routing to appropriate processing services.

**Port:** 9103 (HTTP), 9104 (WebSocket)

**Responsibilities:**
- REST API endpoint management across 8 route modules
- WebSocket event streaming with sub-50ms latency
- Request validation and authentication
- MCP tool interface (22 tools total)
- Multi-tenancy support with row-level security

**Technology Stack:**
- Runtime: Node.js with TypeScript
- Framework: Express.js or Fastify
- WebSocket: Socket.IO
- Validation: Zod or Joi schemas

```mermaid
flowchart LR
    subgraph APIRoutes["API Route Modules"]
        Layers["Layers CRUD"]
        Features["Features"]
        Spatial["Spatial Ops"]
        Tracking["Tracking"]
        Geofencing["Geofencing"]
        H3["H3 Grid"]
        Ingestion["Ingestion"]
        HyperModal["HyperModal"]
    end

    Request["Incoming Request"] --> Router["Route Handler"]
    Router --> Layers
    Router --> Features
    Router --> Spatial
    Router --> Tracking
    Router --> Geofencing
    Router --> H3
    Router --> Ingestion
    Router --> HyperModal
```

### Worker Service (Go)

The Worker Service handles computationally intensive spatial processing tasks asynchronously, enabling the API to remain responsive under heavy loads.

**Port:** 9105

**Responsibilities:**
- Asynchronous job processing via Asynq queue
- Spatial calculations and geometric operations
- Batch feature processing
- Trajectory analysis
- H3 grid aggregation

**Technology Stack:**
- Language: Go
- Job Queue: Asynq (Redis-backed)
- Spatial Libraries: S2 Geometry, H3-go

### ML Service (Python/PyTorch)

The ML Service provides advanced multi-modal geospatial processing capabilities, including LiDAR, hyperspectral, SAR, and thermal analysis.

**Port:** 9108

**Responsibilities:**
- LiDAR point cloud processing (DEM/DSM/CHM generation)
- Hyperspectral analysis and spectral unmixing
- SAR interferometry and change detection
- Thermal anomaly detection
- Multi-modal data fusion

**Technology Stack:**
- Language: Python 3.10+
- ML Framework: PyTorch
- Geospatial: GDAL, Rasterio, PDAL
- Scientific: NumPy, SciPy, scikit-learn

```mermaid
flowchart TB
    subgraph MLCapabilities["ML Service Capabilities"]
        subgraph LiDAR["LiDAR Processing"]
            DEM["DEM Gen"]
            DSM["DSM/CHM Gen"]
            GroundClass["Ground Class"]
            ObjectExtract["Object Extract"]
        end

        subgraph Spectral["Hyperspectral"]
            Unmix["Spectral Unmix"]
            Material["Material ID"]
            Vegetation["Veg Indices"]
        end

        subgraph SAR["SAR Processing"]
            InSAR["InSAR"]
            Coherence["Coherence"]
            ChangeDetect["Change Detect"]
        end

        subgraph Thermal["Thermal Analysis"]
            HeatMap["Heat Mapping"]
            Anomaly["Anomaly Detect"]
        end

        subgraph Fusion["Multi-Modal Fusion"]
            PixelFusion["Pixel Fusion"]
            FeatureFusion["Feature Fusion"]
            DecisionFusion["Decision Fusion"]
        end
    end

    Input["Multi-Modal Input"] --> LiDAR
    Input --> Spectral
    Input --> SAR
    Input --> Thermal

    LiDAR --> Fusion
    Spectral --> Fusion
    SAR --> Fusion
    Thermal --> Fusion

    Fusion --> Output["Analysis Output"]
```

## Data Flow Architecture

### Request Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as API:9103
    participant Worker as Worker:9105
    participant ML as ML:9108
    participant PostGIS
    participant MinIO
    participant Redis

    Client->>API: HTTP/WebSocket Request
    API->>Redis: Check Cache

    alt Cache Hit
        Redis-->>API: Cached Response
        API-->>Client: Return Result
    else Cache Miss
        alt Simple Query
            API->>PostGIS: Execute Query
            PostGIS-->>API: Results
        else Heavy Processing
            API->>Redis: Queue Job
            Worker->>Redis: Dequeue Job
            Worker->>PostGIS: Process Data
            Worker->>Redis: Store Result
            API->>Redis: Poll Result
        else ML Processing
            API->>ML: Submit Task
            ML->>MinIO: Fetch Data
            ML->>ML: Process
            ML->>MinIO: Store Results
            ML-->>API: Return Reference
        end
        API->>Redis: Cache Result
        API-->>Client: Return Result
    end
```

### Real-time Tracking Flow

```mermaid
sequenceDiagram
    participant Asset as Tracking Device
    participant WS as WebSocket:9104
    participant API as API Service
    participant Redis
    participant PostGIS
    participant Subscribers as Subscribers

    Asset->>WS: Location Update
    WS->>API: Process Update
    API->>Redis: Publish Event
    API->>PostGIS: Store Location

    par Geofence Check
        API->>PostGIS: Check Geofence Triggers
        PostGIS-->>API: Trigger Results
        API->>Redis: Publish Triggers
    end

    Redis-->>WS: Broadcast Events
    WS-->>Subscribers: Push Updates
```

## Storage Architecture

### PostGIS Database Schema

The database uses JSONB geometry storage with optional PostGIS extensions for advanced spatial operations.

```mermaid
erDiagram
    LAYERS {
        uuid id PK
        uuid tenant_id FK
        string name
        string data_type
        jsonb metadata
        timestamp created_at
    }

    FEATURES {
        uuid id PK
        uuid layer_id FK
        jsonb geometry
        jsonb properties
        h3_index h3_cell
        timestamp created_at
    }

    GEOFENCES {
        uuid id PK
        uuid tenant_id FK
        string name
        jsonb boundary
        boolean trigger_enter
        boolean trigger_exit
        boolean active
    }

    TRACKING_HISTORY {
        uuid id PK
        uuid asset_id FK
        jsonb location
        jsonb velocity
        timestamp recorded_at
    }

    HYPERMODAL_DATASETS {
        uuid id PK
        string data_type
        string minio_path
        jsonb metadata
        jsonb bounds
        timestamp processed_at
    }

    LAYERS ||--o{ FEATURES : contains
    GEOFENCES ||--o{ TRACKING_HISTORY : monitors
    HYPERMODAL_DATASETS ||--o{ FEATURES : generates
```

### MinIO Object Storage

MinIO provides scalable storage for large geospatial files that are impractical to store in the database.

**Ports:** 9106 (API), 9107 (Console)

**Bucket Structure:**
- `geoagent-lidar/` - LAS/LAZ point cloud files
- `geoagent-spectral/` - HDF5/ENVI hyperspectral data
- `geoagent-thermal/` - Thermal imagery
- `geoagent-sar/` - SAR data products
- `geoagent-outputs/` - Processed results (GeoTIFF, derivatives)

## Integration Architecture

### Nexus Stack Integration Points

```mermaid
flowchart LR
    subgraph GeoAgent
        API["API Service"]
        Worker["Worker Service"]
    end

    subgraph GraphRAG["GraphRAG"]
        SpatialRel["Spatial Rels"]
        AnalysisStore["Analysis Store"]
    end

    subgraph Qdrant["Qdrant"]
        GeoFilter["Geo Filter"]
        VectorIndex["Vector Index"]
    end

    subgraph MageAgent["MageAgent"]
        SpatialReason["Spatial Reason"]
        MultiAgent["Multi-Agent"]
    end

    subgraph FileProcess["FileProcessAgent"]
        GeoIngest["Geo Ingest"]
        FormatConvert["Format Convert"]
    end

    API --> GraphRAG
    API --> Qdrant
    API --> MageAgent
    API --> FileProcess

    Worker --> GraphRAG
```

### Integration Details

**GraphRAG (Port 8090)**
- Stores spatial relationships between entities
- Enables knowledge graph queries with spatial context
- Supports HyperModal analysis result storage

**Qdrant (Port 6333)**
- Geo-filtered semantic search
- Spatial vector indexing for similarity queries
- Location-aware document retrieval

**MageAgent (Port 8080)**
- Spatial reasoning capabilities for AI agents
- Multi-agent geospatial coordination
- Location-aware task execution

**FileProcessAgent**
- Geospatial file format ingestion
- Format conversion (GeoJSON, KML, Shapefile, GPX, CSV)
- Coordinate system transformation

## Scalability Architecture

### Horizontal Scaling Strategy

```mermaid
flowchart TB
    subgraph LoadBalancer["Load Balancer"]
        LB["nginx/HAProxy"]
    end

    subgraph APIInstances["API Instances"]
        API1["API 1"]
        API2["API 2"]
        API3["API N"]
    end

    subgraph WorkerPool["Worker Pool"]
        W1["Worker 1"]
        W2["Worker 2"]
        W3["Worker N"]
    end

    subgraph MLPool["ML Service Pool"]
        ML1["ML 1 GPU/CPU"]
        ML2["ML 2 GPU/CPU"]
    end

    subgraph SharedState["Shared State"]
        Redis["Redis Cluster"]
        PostGIS["PostGIS Replicas"]
        MinIO["MinIO Distributed"]
    end

    LB --> API1
    LB --> API2
    LB --> API3

    API1 --> Redis
    API2 --> Redis
    API3 --> Redis

    Redis --> W1
    Redis --> W2
    Redis --> W3

    API1 --> PostGIS
    W1 --> PostGIS
    ML1 --> MinIO
```

### Scaling Considerations

**API Service Scaling:**
- Stateless design enables horizontal scaling
- Session state maintained in Redis
- WebSocket connections managed via Redis pub/sub

**Worker Service Scaling:**
- Asynq queue supports multiple workers
- Job distribution handled automatically
- Designed for concurrent spatial operations

**ML Service Scaling:**
- GPU acceleration for LiDAR and spectral processing
- Supports CPU-only deployment with reduced performance
- Job-based scaling based on processing queue depth

**Database Scaling:**
- Read replicas for query distribution
- GIST spatial indexes for query performance
- Connection pooling recommended

## Security Architecture

### Authentication and Authorization

```mermaid
flowchart TB
    subgraph Client
        Request["API Request"]
    end

    subgraph Auth["Authentication"]
        APIKey["API Key"]
        JWT["JWT Verify"]
        Tenant["Tenant ID"]
    end

    subgraph Authz["Authorization"]
        RLS["Row-Level Sec"]
        Spatial["Spatial Perms"]
        Resource["Resource ACLs"]
    end

    subgraph Privacy["Location Privacy"]
        DiffPrivacy["Diff Privacy"]
        KAnon["K-Anonymity"]
        GeoHash["Geohashing"]
    end

    Request --> APIKey
    APIKey --> JWT
    JWT --> Tenant
    Tenant --> RLS
    RLS --> Spatial
    Spatial --> Resource
    Resource --> Privacy
```

### Security Layers

**Transport Security:**
- HTTPS/TLS for all production traffic
- WSS for WebSocket connections
- Certificate management via Let's Encrypt

**Authentication:**
- API key authentication for service-to-service
- JWT tokens for user sessions
- Multi-tenant isolation

**Authorization:**
- Row-level security in PostgreSQL
- Spatial permission boundaries
- Resource-level access control lists

**Location Privacy:**
- Differential privacy for aggregate queries
- K-anonymity for location sharing
- Geohashing for approximate locations
- Configurable precision levels

### Audit and Compliance

- Comprehensive audit logging
- Location access tracking
- Data retention policies
- GDPR compliance support

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| API Service | TypeScript, Node.js | REST API, WebSocket handling |
| Worker Service | Go | Async spatial processing |
| ML Service | Python, PyTorch | Multi-modal analysis |
| Database | PostgreSQL + PostGIS | Spatial data storage |
| Object Storage | MinIO | Large file storage |
| Cache/Queue | Redis | Caching, job queue |
| Spatial Index | Uber H3 | Hexagonal grid indexing |
| Vector Search | Qdrant | Geo-filtered similarity |
| Knowledge Graph | Neo4j, GraphRAG | Spatial relationships |

## Port Reference

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| API Service | 9103 | HTTP | REST API endpoints |
| WebSocket | 9104 | WS | Real-time event streaming |
| Worker Service | 9105 | HTTP | Metrics and health |
| MinIO API | 9106 | HTTP | Object storage API |
| MinIO Console | 9107 | HTTP | Web-based management |
| ML Service | 9108 | HTTP | ML processing API |

## Deployment Considerations

### Container Resources

**API Service:**
- Memory: 512MB - 1GB
- CPU: 0.5 - 1 core
- Scales horizontally

**Worker Service:**
- Memory: 1GB - 2GB
- CPU: 1 - 2 cores
- Scales based on job queue

**ML Service:**
- Memory: 4GB - 16GB
- CPU: 2 - 4 cores (or GPU)
- Optional GPU acceleration

### Health Monitoring

- API Health: GET /health on port 9103
- Worker Metrics: GET /metrics on port 9105
- ML Health: GET /health on port 9108
- MinIO Health: Built-in console monitoring

---

*GeoAgent Architecture - Enabling spatial intelligence across the Nexus ecosystem*