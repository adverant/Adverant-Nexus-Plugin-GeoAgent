-- Migration: Core GeoAgent tables
-- Author: GeoAgent Service
-- Date: 2024-11-04
-- Description: Create core tables for geospatial data storage

SET search_path TO geoagent, public;

-- Data layers table (collections of spatial features)
CREATE TABLE IF NOT EXISTS geoagent.data_layers (
    layer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) CHECK (data_type IN ('points', 'lines', 'polygons', 'raster', 'mixed')),
    visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
    tenant_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    source_info JSONB DEFAULT '{}', -- Original file info, URL, etc.
    spatial_extent GEOMETRY(Polygon, 4326), -- Bounding box of all features
    feature_count INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT unique_layer_name_tenant UNIQUE(name, tenant_id),
    CONSTRAINT valid_feature_count CHECK (feature_count >= 0),
    CONSTRAINT valid_version CHECK (version > 0)
);

-- Geospatial features table (individual spatial objects)
CREATE TABLE IF NOT EXISTS geoagent.geospatial_features (
    feature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layer_id UUID NOT NULL REFERENCES geoagent.data_layers(layer_id) ON DELETE CASCADE,
    geom GEOMETRY NOT NULL, -- PostGIS geometry (any type)
    geom_type VARCHAR(50) GENERATED ALWAYS AS (GeometryType(geom)) STORED,
    srid INTEGER GENERATED ALWAYS AS (ST_SRID(geom)) STORED,

    -- H3 hexagonal indexes at different resolutions
    h3_index_7 BIGINT GENERATED ALWAYS AS (
        CASE WHEN GeometryType(geom) = 'POINT'
        THEN h3_lat_lng_to_cell(ST_Y(geom::geography), ST_X(geom::geography), 7)
        ELSE NULL END
    ) STORED,
    h3_index_9 BIGINT GENERATED ALWAYS AS (
        CASE WHEN GeometryType(geom) = 'POINT'
        THEN h3_lat_lng_to_cell(ST_Y(geom::geography), ST_X(geom::geography), 9)
        ELSE NULL END
    ) STORED,
    h3_index_11 BIGINT GENERATED ALWAYS AS (
        CASE WHEN GeometryType(geom) = 'POINT'
        THEN h3_lat_lng_to_cell(ST_Y(geom::geography), ST_X(geom::geography), 11)
        ELSE NULL END
    ) STORED,

    properties JSONB DEFAULT '{}',
    name VARCHAR(255),
    description TEXT,
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE,
    tags TEXT[] DEFAULT '{}',
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    source_id VARCHAR(255), -- Original feature ID from import
    CONSTRAINT valid_geometry CHECK (ST_IsValid(geom))
);

-- Real-time tracking table (for moving objects)
CREATE TABLE IF NOT EXISTS geoagent.tracking_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL,
    asset_type VARCHAR(50), -- vehicle, person, drone, ship, etc.
    location GEOMETRY(Point, 4326) NOT NULL,
    h3_index BIGINT GENERATED ALWAYS AS (
        h3_lat_lng_to_cell(ST_Y(location::geography), ST_X(location::geography), 11)
    ) STORED,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    speed FLOAT CHECK (speed >= 0), -- meters per second
    heading FLOAT CHECK (heading >= 0 AND heading < 360), -- degrees
    altitude FLOAT, -- meters
    accuracy FLOAT CHECK (accuracy >= 0), -- meters
    battery_level FLOAT CHECK (battery_level >= 0 AND battery_level <= 100),
    metadata JSONB DEFAULT '{}',
    tenant_id UUID NOT NULL,
    session_id UUID,
    is_valid BOOLEAN DEFAULT true,
    CONSTRAINT valid_location CHECK (ST_IsValid(location))
);

-- Geofences table (spatial boundaries for alerts)
CREATE TABLE IF NOT EXISTS geoagent.geofences (
    geofence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    boundary GEOMETRY(Polygon, 4326) NOT NULL,
    geofence_type VARCHAR(50) DEFAULT 'static' CHECK (geofence_type IN ('static', 'dynamic', 'temporal')),
    active BOOLEAN DEFAULT true,
    trigger_on_enter BOOLEAN DEFAULT true,
    trigger_on_exit BOOLEAN DEFAULT true,
    trigger_on_dwell BOOLEAN DEFAULT false,
    dwell_time_seconds INTEGER CHECK (dwell_time_seconds > 0),
    metadata JSONB DEFAULT '{}',
    rules JSONB DEFAULT '{}', -- Complex trigger rules
    tenant_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE,
    tags TEXT[] DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    CONSTRAINT valid_boundary CHECK (ST_IsValid(boundary)),
    CONSTRAINT unique_geofence_name_tenant UNIQUE(name, tenant_id)
);

-- Geofence triggers log
CREATE TABLE IF NOT EXISTS geoagent.geofence_triggers (
    trigger_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geofence_id UUID NOT NULL REFERENCES geoagent.geofences(geofence_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL,
    trigger_type VARCHAR(20) CHECK (trigger_type IN ('enter', 'exit', 'dwell')),
    location GEOMETRY(Point, 4326) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT false,
    notification_sent BOOLEAN DEFAULT false,
    tenant_id UUID NOT NULL
);

-- Spatial analysis jobs table
CREATE TABLE IF NOT EXISTS geoagent.processing_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN (
        'ingestion', 'proximity', 'intersection', 'buffer', 'union',
        'heatmap', 'clustering', 'routing', 'geocoding', 'export'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    )),
    input_params JSONB NOT NULL DEFAULT '{}',
    output_results JSONB DEFAULT '{}',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_message TEXT,
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_completion TIMESTAMP WITH TIME ZONE,
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

-- Geocoding cache table
CREATE TABLE IF NOT EXISTS geoagent.geocoding_cache (
    cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address TEXT NOT NULL,
    normalized_address TEXT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    geocoding_provider VARCHAR(50), -- google, mapbox, nominatim, etc.
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    use_count INTEGER DEFAULT 1,
    CONSTRAINT unique_normalized_address UNIQUE(normalized_address, geocoding_provider)
);

-- Spatial relationships table (for complex relationships)
CREATE TABLE IF NOT EXISTS geoagent.spatial_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_feature_id UUID NOT NULL REFERENCES geoagent.geospatial_features(feature_id) ON DELETE CASCADE,
    target_feature_id UUID NOT NULL REFERENCES geoagent.geospatial_features(feature_id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
        'contains', 'within', 'intersects', 'touches', 'crosses',
        'overlaps', 'disjoint', 'equals', 'covers', 'covered_by'
    )),
    distance FLOAT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT unique_relationship UNIQUE(source_feature_id, target_feature_id, relationship_type)
);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION geoagent.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to all tables with updated_at column
CREATE TRIGGER update_data_layers_updated_at BEFORE UPDATE ON geoagent.data_layers
    FOR EACH ROW EXECUTE FUNCTION geoagent.update_updated_at_column();

CREATE TRIGGER update_geospatial_features_updated_at BEFORE UPDATE ON geoagent.geospatial_features
    FOR EACH ROW EXECUTE FUNCTION geoagent.update_updated_at_column();

CREATE TRIGGER update_geofences_updated_at BEFORE UPDATE ON geoagent.geofences
    FOR EACH ROW EXECUTE FUNCTION geoagent.update_updated_at_column();

-- Create spatial indexes
CREATE INDEX idx_features_geom ON geoagent.geospatial_features USING GIST (geom);
CREATE INDEX idx_features_layer ON geoagent.geospatial_features (layer_id);
CREATE INDEX idx_features_tenant ON geoagent.geospatial_features (tenant_id);
CREATE INDEX idx_features_h3_7 ON geoagent.geospatial_features (h3_index_7) WHERE h3_index_7 IS NOT NULL;
CREATE INDEX idx_features_h3_9 ON geoagent.geospatial_features (h3_index_9) WHERE h3_index_9 IS NOT NULL;
CREATE INDEX idx_features_h3_11 ON geoagent.geospatial_features (h3_index_11) WHERE h3_index_11 IS NOT NULL;
CREATE INDEX idx_features_properties ON geoagent.geospatial_features USING GIN (properties);
CREATE INDEX idx_features_tags ON geoagent.geospatial_features USING GIN (tags);
CREATE INDEX idx_features_temporal ON geoagent.geospatial_features (valid_from, valid_to);

CREATE INDEX idx_tracking_location ON geoagent.tracking_events USING GIST (location);
CREATE INDEX idx_tracking_time ON geoagent.tracking_events (timestamp DESC);
CREATE INDEX idx_tracking_asset ON geoagent.tracking_events (asset_id, timestamp DESC);
CREATE INDEX idx_tracking_h3 ON geoagent.tracking_events (h3_index) WHERE h3_index IS NOT NULL;
CREATE INDEX idx_tracking_tenant ON geoagent.tracking_events (tenant_id);

CREATE INDEX idx_geofences_boundary ON geoagent.geofences USING GIST (boundary);
CREATE INDEX idx_geofences_active ON geoagent.geofences (active) WHERE active = true;
CREATE INDEX idx_geofences_tenant ON geoagent.geofences (tenant_id);
CREATE INDEX idx_geofences_temporal ON geoagent.geofences (valid_from, valid_to);

CREATE INDEX idx_triggers_geofence ON geoagent.geofence_triggers (geofence_id);
CREATE INDEX idx_triggers_asset ON geoagent.geofence_triggers (asset_id);
CREATE INDEX idx_triggers_timestamp ON geoagent.geofence_triggers (timestamp DESC);
CREATE INDEX idx_triggers_unprocessed ON geoagent.geofence_triggers (processed) WHERE processed = false;

CREATE INDEX idx_jobs_status ON geoagent.processing_jobs (status, priority DESC, created_at);
CREATE INDEX idx_jobs_tenant ON geoagent.processing_jobs (tenant_id);
CREATE INDEX idx_jobs_user ON geoagent.processing_jobs (user_id);

CREATE INDEX idx_geocoding_address ON geoagent.geocoding_cache (normalized_address);
CREATE INDEX idx_geocoding_location ON geoagent.geocoding_cache USING GIST (location);

CREATE INDEX idx_relationships_source ON geoagent.spatial_relationships (source_feature_id);
CREATE INDEX idx_relationships_target ON geoagent.spatial_relationships (target_feature_id);
CREATE INDEX idx_relationships_type ON geoagent.spatial_relationships (relationship_type);

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'GeoAgent core tables created successfully';
END $$;