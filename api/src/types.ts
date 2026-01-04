import { Geometry, Feature, FeatureCollection, Point, Polygon, LineString } from 'geojson';

// Base types
export interface TimestampedEntity {
  created_at: Date;
  updated_at: Date;
}

export interface TenantScopedEntity {
  tenant_id: string;
}

// Layer types
export interface DataLayer extends TimestampedEntity, TenantScopedEntity {
  layer_id: string;
  name: string;
  description?: string;
  data_type: 'points' | 'lines' | 'polygons' | 'raster' | 'mixed';
  visibility: 'public' | 'private' | 'shared';
  owner_id: string;
  metadata: Record<string, any>;
  tags: string[];
  source_info?: {
    url?: string;
    filename?: string;
    format?: string;
    upload_date?: Date;
  };
  spatial_extent?: Geometry;
  feature_count: number;
  version: number;
  is_active: boolean;
}

// Feature types
export interface GeospatialFeature extends TimestampedEntity, TenantScopedEntity {
  feature_id: string;
  layer_id: string;
  geom: Geometry;
  geom_type?: string;
  srid?: number;
  h3_index_7?: bigint;
  h3_index_9?: bigint;
  h3_index_11?: bigint;
  properties: Record<string, any>;
  name?: string;
  description?: string;
  valid_from?: Date;
  valid_to?: Date;
  tags: string[];
  confidence?: number;
  source_id?: string;
}

// Tracking types
export interface TrackingEvent extends TenantScopedEntity {
  event_id: string;
  asset_id: string;
  asset_type?: string;
  location: Point;
  h3_index?: bigint;
  timestamp: Date;
  speed?: number; // m/s
  heading?: number; // degrees
  altitude?: number; // meters
  accuracy?: number; // meters
  battery_level?: number; // percentage
  metadata: Record<string, any>;
  session_id?: string;
  is_valid: boolean;
}

// Geofence types
export interface Geofence extends TimestampedEntity, TenantScopedEntity {
  geofence_id: string;
  name: string;
  description?: string;
  boundary: Polygon;
  geofence_type: 'static' | 'dynamic' | 'temporal';
  active: boolean;
  trigger_on_enter: boolean;
  trigger_on_exit: boolean;
  trigger_on_dwell: boolean;
  dwell_time_seconds?: number;
  metadata: Record<string, any>;
  rules?: {
    conditions?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
    actions?: Array<{
      type: string;
      params: Record<string, any>;
    }>;
  };
  owner_id: string;
  valid_from?: Date;
  valid_to?: Date;
  tags: string[];
  priority: number;
}

export interface GeofenceTrigger extends TenantScopedEntity {
  trigger_id: string;
  geofence_id: string;
  asset_id: string;
  trigger_type: 'enter' | 'exit' | 'dwell';
  location: Point;
  timestamp: Date;
  metadata: Record<string, any>;
  processed: boolean;
  notification_sent: boolean;
}

// Job types
export interface ProcessingJob extends TenantScopedEntity {
  job_id: string;
  job_type: 'ingestion' | 'proximity' | 'intersection' | 'buffer' | 'union' |
            'heatmap' | 'clustering' | 'routing' | 'geocoding' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input_params: Record<string, any>;
  output_results?: Record<string, any>;
  progress: number;
  error_message?: string;
  user_id: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  estimated_completion?: Date;
  priority: number;
  retry_count: number;
  max_retries: number;
}

// API Request/Response types
export interface ProximitySearchRequest {
  center: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  radius: number; // meters
  layer_id?: string;
  limit?: number;
  filters?: Record<string, any>;
}

export interface ProximitySearchResponse {
  type: 'FeatureCollection';
  features: Array<Feature & {
    properties: {
      distance: number;
      [key: string]: any;
    };
  }>;
  metadata: {
    center: [number, number];
    radius: number;
    total_features: number;
    query_time_ms: number;
  };
}

export interface BufferRequest {
  feature_id: string;
  distance: number; // meters
  cap_style?: 'round' | 'flat' | 'square';
  join_style?: 'round' | 'mitre' | 'bevel';
  segments?: number;
}

export interface BufferResponse {
  type: 'Feature';
  geometry: Polygon;
  properties: {
    source_feature_id: string;
    buffer_distance: number;
    area_sq_meters: number;
  };
}

export interface HeatmapRequest {
  layer_id: string;
  cell_size: number; // meters
  kernel_radius?: number; // meters
  aggregation?: 'count' | 'sum' | 'avg' | 'max' | 'min';
  property_field?: string; // for sum/avg/max/min
  bounds?: {
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  };
}

export interface HeatmapResponse {
  type: 'FeatureCollection';
  features: Array<Feature<Polygon> & {
    properties: {
      density: number;
      count: number;
      value?: number;
    };
  }>;
  metadata: {
    cell_size: number;
    kernel_radius: number;
    total_cells: number;
    min_value: number;
    max_value: number;
  };
}

export interface ClusteringRequest {
  layer_id: string;
  num_clusters: number;
  algorithm: 'kmeans' | 'dbscan' | 'hierarchical';
  use_properties?: boolean;
  property_fields?: string[];
}

export interface ClusteringResponse {
  clusters: Array<{
    cluster_id: number;
    center: Point;
    feature_ids: string[];
    feature_count: number;
    properties?: Record<string, any>;
  }>;
  metadata: {
    algorithm: string;
    num_clusters: number;
    silhouette_score?: number;
  };
}

export interface TrajectoryAnalysisRequest {
  asset_id: string;
  start_time?: string; // ISO 8601
  end_time?: string;
  simplify?: boolean;
  tolerance?: number;
}

export interface TrajectoryAnalysisResponse {
  trajectory: LineString;
  statistics: {
    total_distance_meters: number;
    avg_speed_mps: number;
    max_speed_mps: number;
    duration_seconds: number;
    point_count: number;
  };
  segments?: Array<{
    start_time: string;
    end_time: string;
    distance: number;
    speed: number;
  }>;
}

// WebSocket event types
export interface LocationUpdateEvent {
  event: 'location:update';
  data: {
    asset_id: string;
    location: [number, number];
    timestamp: string;
    speed?: number;
    heading?: number;
    metadata?: Record<string, any>;
  };
}

export interface GeofenceTriggerEvent {
  event: 'geofence:trigger';
  data: {
    geofence_id: string;
    geofence_name: string;
    asset_id: string;
    trigger_type: 'enter' | 'exit' | 'dwell';
    location: [number, number];
    timestamp: string;
  };
}

export interface JobProgressEvent {
  event: 'job:progress';
  data: {
    job_id: string;
    job_type: string;
    status: string;
    progress: number;
    message?: string;
    estimated_completion?: string;
  };
}

// Error types
export class GeoAgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'GeoAgentError';
  }
}

export class ValidationError extends GeoAgentError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends GeoAgentError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NOT_FOUND', 404, context);
    this.name = 'NotFoundError';
  }
}

export class SpatialError extends GeoAgentError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SPATIAL_ERROR', 422, context);
    this.name = 'SpatialError';
  }
}

// H3 types
export interface H3GridCell {
  h3_index: string;
  center: [number, number];
  boundary: Array<[number, number]>;
  resolution: number;
  value?: number;
  properties?: Record<string, any>;
}

export interface H3AggregationResult {
  cells: H3GridCell[];
  metadata: {
    resolution: number;
    total_cells: number;
    bounds: {
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    };
  };
}

// Integration types
export interface GraphRAGIntegration {
  embedding?: number[];
  embedding_model?: string;
  semantic_tags?: string[];
  entity_id?: string;
}

export interface QdrantIntegration {
  collection: string;
  vector_id?: string;
  payload?: Record<string, any>;
}

export interface Neo4jIntegration {
  node_id?: string;
  relationships?: Array<{
    type: string;
    target_id: string;
    properties?: Record<string, any>;
  }>;
}