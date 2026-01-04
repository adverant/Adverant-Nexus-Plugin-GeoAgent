-- Migration: H3 hexagonal grid functions
-- Author: GeoAgent Service
-- Date: 2024-11-04
-- Description: Create H3 hexagonal grid functions (fallback if H3 extension not available)

SET search_path TO geoagent, public;

-- Check if H3 extension is available
DO $$
BEGIN
    -- Try to create H3 extension if not exists
    BEGIN
        CREATE EXTENSION IF NOT EXISTS h3;
        RAISE NOTICE 'H3 extension enabled successfully';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'H3 extension not available, creating fallback functions';
    END;
END $$;

-- Create fallback H3 functions if extension not available
CREATE OR REPLACE FUNCTION geoagent.h3_lat_lng_to_cell(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    resolution INTEGER
) RETURNS BIGINT AS $$
DECLARE
    h3_exists BOOLEAN;
BEGIN
    -- Check if H3 extension function exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc
        WHERE proname = 'h3_lat_lng_to_cell'
        AND pronamespace != 'geoagent'::regnamespace
    ) INTO h3_exists;

    IF h3_exists THEN
        -- Use the actual H3 function
        RETURN h3_lat_lng_to_cell(lat, lng, resolution);
    ELSE
        -- Fallback: Create a simple geohash-based index
        -- This is a simplified placeholder - in production, use actual H3 library
        RETURN (
            (floor(lat * power(10, resolution))::BIGINT << 32) |
            (floor(lng * power(10, resolution))::BIGINT & x'FFFFFFFF'::BIGINT)
        );
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get H3 neighbors
CREATE OR REPLACE FUNCTION geoagent.h3_k_ring(
    h3_index BIGINT,
    k INTEGER
) RETURNS BIGINT[] AS $$
DECLARE
    h3_exists BOOLEAN;
BEGIN
    -- Check if H3 extension function exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc
        WHERE proname = 'h3_k_ring'
        AND pronamespace != 'geoagent'::regnamespace
    ) INTO h3_exists;

    IF h3_exists THEN
        -- Use the actual H3 function
        RETURN h3_k_ring(h3_index, k);
    ELSE
        -- Fallback: Return empty array
        -- In production, implement actual neighbor calculation
        RETURN ARRAY[]::BIGINT[];
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to convert H3 to geometry
CREATE OR REPLACE FUNCTION geoagent.h3_cell_to_boundary(
    h3_index BIGINT
) RETURNS GEOMETRY AS $$
DECLARE
    h3_exists BOOLEAN;
    lat DOUBLE PRECISION;
    lng DOUBLE PRECISION;
BEGIN
    -- Check if H3 extension function exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc
        WHERE proname = 'h3_cell_to_boundary'
        AND pronamespace != 'geoagent'::regnamespace
    ) INTO h3_exists;

    IF h3_exists THEN
        -- Use the actual H3 function
        RETURN h3_cell_to_boundary(h3_index)::geometry;
    ELSE
        -- Fallback: Create a simple square around the point
        -- Extract approximate lat/lng from our simplified index
        lat := ((h3_index >> 32) & x'FFFFFFFF'::BIGINT)::DOUBLE PRECISION / power(10, 9);
        lng := (h3_index & x'FFFFFFFF'::BIGINT)::DOUBLE PRECISION / power(10, 9);

        -- Create a small polygon around the point
        RETURN ST_Buffer(ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, 100)::geometry;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get H3 resolution for a given area
CREATE OR REPLACE FUNCTION geoagent.h3_get_resolution_for_area(
    area_sq_km FLOAT
) RETURNS INTEGER AS $$
BEGIN
    -- Resolution mapping based on average hexagon area
    -- Res 0: 4,250,546 km²
    -- Res 1: 607,221 km²
    -- Res 2: 86,746 km²
    -- Res 3: 12,392 km²
    -- Res 4: 1,770 km²
    -- Res 5: 253 km²
    -- Res 6: 36 km²
    -- Res 7: 5.16 km²
    -- Res 8: 0.74 km²
    -- Res 9: 0.11 km²
    -- Res 10: 0.015 km²
    -- Res 11: 0.002 km²

    IF area_sq_km > 100000 THEN
        RETURN 2;
    ELSIF area_sq_km > 10000 THEN
        RETURN 3;
    ELSIF area_sq_km > 1000 THEN
        RETURN 4;
    ELSIF area_sq_km > 100 THEN
        RETURN 5;
    ELSIF area_sq_km > 10 THEN
        RETURN 6;
    ELSIF area_sq_km > 1 THEN
        RETURN 7;
    ELSIF area_sq_km > 0.5 THEN
        RETURN 8;
    ELSIF area_sq_km > 0.05 THEN
        RETURN 9;
    ELSIF area_sq_km > 0.01 THEN
        RETURN 10;
    ELSE
        RETURN 11;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to aggregate points to H3 grid
CREATE OR REPLACE FUNCTION geoagent.aggregate_to_h3(
    layer_id_param UUID,
    resolution INTEGER,
    aggregation_type VARCHAR DEFAULT 'count'
) RETURNS TABLE (
    h3_index BIGINT,
    hex_boundary GEOMETRY,
    value FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH h3_aggregated AS (
        SELECT
            CASE
                WHEN gf.geom_type = 'POINT' THEN
                    geoagent.h3_lat_lng_to_cell(
                        ST_Y(gf.geom::geography),
                        ST_X(gf.geom::geography),
                        resolution
                    )
                ELSE
                    geoagent.h3_lat_lng_to_cell(
                        ST_Y(ST_Centroid(gf.geom)::geography),
                        ST_X(ST_Centroid(gf.geom)::geography),
                        resolution
                    )
            END AS h3_idx,
            COUNT(*) AS feature_count,
            jsonb_agg(gf.properties) AS properties_array
        FROM geoagent.geospatial_features gf
        WHERE gf.layer_id = layer_id_param
        GROUP BY h3_idx
    )
    SELECT
        ha.h3_idx AS h3_index,
        geoagent.h3_cell_to_boundary(ha.h3_idx) AS hex_boundary,
        CASE
            WHEN aggregation_type = 'count' THEN ha.feature_count::FLOAT
            WHEN aggregation_type = 'sum' THEN (
                SELECT SUM((prop->>'value')::FLOAT)
                FROM jsonb_array_elements(ha.properties_array) AS prop
            )
            WHEN aggregation_type = 'avg' THEN (
                SELECT AVG((prop->>'value')::FLOAT)
                FROM jsonb_array_elements(ha.properties_array) AS prop
            )
            ELSE ha.feature_count::FLOAT
        END AS value,
        jsonb_build_object(
            'feature_count', ha.feature_count,
            'aggregation_type', aggregation_type
        ) AS metadata
    FROM h3_aggregated ha;
END;
$$ LANGUAGE plpgsql;

-- Function for hierarchical H3 aggregation (rollup from fine to coarse resolution)
CREATE OR REPLACE FUNCTION geoagent.h3_rollup(
    layer_id_param UUID,
    from_resolution INTEGER,
    to_resolution INTEGER,
    aggregation_type VARCHAR DEFAULT 'sum'
) RETURNS TABLE (
    h3_index BIGINT,
    hex_boundary GEOMETRY,
    value FLOAT,
    child_count INTEGER
) AS $$
BEGIN
    IF from_resolution <= to_resolution THEN
        RAISE EXCEPTION 'from_resolution must be greater than to_resolution';
    END IF;

    -- For now, return aggregated data at target resolution
    -- In production, implement proper parent-child H3 relationship
    RETURN QUERY
    SELECT
        ah.h3_index,
        ah.hex_boundary,
        ah.value,
        ah.metadata->>'feature_count'::INTEGER AS child_count
    FROM geoagent.aggregate_to_h3(layer_id_param, to_resolution, aggregation_type) ah;
END;
$$ LANGUAGE plpgsql;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'H3 functions created successfully';
END $$;