-- Migration: Enable basic extensions for GeoAgent (PostGIS-optional)
-- Author: GeoAgent Service
-- Date: 2024-11-04
-- Description: Enable extensions with fallback for non-PostGIS environments

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schema for GeoAgent
CREATE SCHEMA IF NOT EXISTS geoagent;

-- Grant permissions
GRANT ALL ON SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA geoagent TO PUBLIC;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA geoagent TO PUBLIC;

-- Set search path
SET search_path TO geoagent, public;

-- Try to enable PostGIS if available (won't fail if not present)
DO $$
BEGIN
    -- Check if PostGIS is available
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE EXTENSION IF NOT EXISTS postgis_topology;
        CREATE EXTENSION IF NOT EXISTS postgis_raster;
        RAISE NOTICE 'PostGIS extensions enabled successfully';

        -- Show PostGIS version if available
        EXECUTE 'SELECT PostGIS_Version()' INTO STRICT EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'PostGIS installed but version check failed';
        END;
    ELSE
        RAISE NOTICE 'PostGIS not available - GeoAgent will run with limited spatial functionality';
        RAISE NOTICE 'For full functionality, install PostGIS in PostgreSQL';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not enable PostGIS: %', SQLERRM;
END $$;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'GeoAgent basic extensions enabled successfully';
END $$;