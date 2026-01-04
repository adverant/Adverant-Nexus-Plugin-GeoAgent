-- Migration: Enable PostGIS and related extensions for GeoAgent
-- Author: GeoAgent Service
-- Date: 2024-11-04
-- Description: Enable spatial extensions required for geospatial operations

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Enable H3 for hexagonal grid system (if available)
-- Note: H3 extension must be installed separately
-- CREATE EXTENSION IF NOT EXISTS h3;

-- Create schema for GeoAgent
CREATE SCHEMA IF NOT EXISTS geoagent;

-- Grant permissions
GRANT ALL ON SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA geoagent TO PUBLIC;

-- Set search path
SET search_path TO geoagent, public;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'GeoAgent extensions enabled successfully';
    RAISE NOTICE 'PostGIS version: %', PostGIS_Version();
END $$;