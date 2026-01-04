-- Migration: Advanced spatial analysis functions
-- Author: GeoAgent Service
-- Date: 2024-11-04
-- Description: Create spatial analysis functions for GeoAgent operations

SET search_path TO geoagent, public;

-- Function for proximity search with distance
CREATE OR REPLACE FUNCTION geoagent.proximity_search(
    center_geom GEOMETRY,
    search_radius_meters FLOAT,
    layer_id_param UUID DEFAULT NULL,
    limit_results INTEGER DEFAULT 100
) RETURNS TABLE (
    feature_id UUID,
    layer_id UUID,
    distance_meters FLOAT,
    geom GEOMETRY,
    properties JSONB,
    name VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gf.feature_id,
        gf.layer_id,
        ST_Distance(gf.geom::geography, center_geom::geography) AS distance_meters,
        gf.geom,
        gf.properties,
        gf.name
    FROM geoagent.geospatial_features gf
    WHERE
        ST_DWithin(gf.geom::geography, center_geom::geography, search_radius_meters)
        AND (layer_id_param IS NULL OR gf.layer_id = layer_id_param)
    ORDER BY distance_meters
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Function for finding features within a polygon
CREATE OR REPLACE FUNCTION geoagent.features_within_polygon(
    boundary_geom GEOMETRY,
    layer_id_param UUID DEFAULT NULL,
    spatial_relation VARCHAR DEFAULT 'within'
) RETURNS TABLE (
    feature_id UUID,
    layer_id UUID,
    geom GEOMETRY,
    properties JSONB,
    name VARCHAR(255),
    relationship VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gf.feature_id,
        gf.layer_id,
        gf.geom,
        gf.properties,
        gf.name,
        CASE
            WHEN spatial_relation = 'within' AND ST_Within(gf.geom, boundary_geom) THEN 'within'
            WHEN spatial_relation = 'contains' AND ST_Contains(boundary_geom, gf.geom) THEN 'contains'
            WHEN spatial_relation = 'intersects' AND ST_Intersects(gf.geom, boundary_geom) THEN 'intersects'
            WHEN spatial_relation = 'touches' AND ST_Touches(gf.geom, boundary_geom) THEN 'touches'
            WHEN spatial_relation = 'crosses' AND ST_Crosses(gf.geom, boundary_geom) THEN 'crosses'
            WHEN spatial_relation = 'overlaps' AND ST_Overlaps(gf.geom, boundary_geom) THEN 'overlaps'
            ELSE 'unknown'
        END AS relationship
    FROM geoagent.geospatial_features gf
    WHERE
        (layer_id_param IS NULL OR gf.layer_id = layer_id_param)
        AND CASE spatial_relation
            WHEN 'within' THEN ST_Within(gf.geom, boundary_geom)
            WHEN 'contains' THEN ST_Contains(boundary_geom, gf.geom)
            WHEN 'intersects' THEN ST_Intersects(gf.geom, boundary_geom)
            WHEN 'touches' THEN ST_Touches(gf.geom, boundary_geom)
            WHEN 'crosses' THEN ST_Crosses(gf.geom, boundary_geom)
            WHEN 'overlaps' THEN ST_Overlaps(gf.geom, boundary_geom)
            ELSE false
        END;
END;
$$ LANGUAGE plpgsql;

-- Function for creating buffer zones
CREATE OR REPLACE FUNCTION geoagent.create_buffer_zone(
    feature_id_param UUID,
    buffer_distance_meters FLOAT,
    cap_style VARCHAR DEFAULT 'round', -- round, flat, square
    join_style VARCHAR DEFAULT 'round' -- round, mitre, bevel
) RETURNS GEOMETRY AS $$
DECLARE
    source_geom GEOMETRY;
    buffer_geom GEOMETRY;
BEGIN
    -- Get the source geometry
    SELECT geom INTO source_geom
    FROM geoagent.geospatial_features
    WHERE feature_id = feature_id_param;

    IF source_geom IS NULL THEN
        RAISE EXCEPTION 'Feature not found: %', feature_id_param;
    END IF;

    -- Create buffer
    -- Convert cap_style and join_style to PostGIS parameters
    buffer_geom := ST_Buffer(
        source_geom::geography,
        buffer_distance_meters,
        CASE cap_style
            WHEN 'flat' THEN 'endcap=flat'
            WHEN 'square' THEN 'endcap=square'
            ELSE 'endcap=round'
        END || ' ' ||
        CASE join_style
            WHEN 'mitre' THEN 'join=mitre'
            WHEN 'bevel' THEN 'join=bevel'
            ELSE 'join=round'
        END
    )::geometry;

    RETURN buffer_geom;
END;
$$ LANGUAGE plpgsql;

-- Function for spatial clustering using K-means
CREATE OR REPLACE FUNCTION geoagent.spatial_clustering(
    layer_id_param UUID,
    num_clusters INTEGER,
    use_properties BOOLEAN DEFAULT false
) RETURNS TABLE (
    feature_id UUID,
    cluster_id INTEGER,
    cluster_center GEOMETRY,
    distance_to_center FLOAT
) AS $$
BEGIN
    -- Use PostGIS ST_ClusterKMeans for clustering
    RETURN QUERY
    WITH clustered AS (
        SELECT
            gf.feature_id,
            ST_ClusterKMeans(gf.geom, num_clusters) OVER () AS cluster_id,
            gf.geom
        FROM geoagent.geospatial_features gf
        WHERE gf.layer_id = layer_id_param
    ),
    cluster_centers AS (
        SELECT
            cluster_id,
            ST_Centroid(ST_Collect(geom)) AS center
        FROM clustered
        GROUP BY cluster_id
    )
    SELECT
        c.feature_id,
        c.cluster_id,
        cc.center AS cluster_center,
        ST_Distance(c.geom::geography, cc.center::geography) AS distance_to_center
    FROM clustered c
    JOIN cluster_centers cc ON c.cluster_id = cc.cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Function for generating heatmaps (returns grid with density values)
CREATE OR REPLACE FUNCTION geoagent.generate_heatmap(
    layer_id_param UUID,
    cell_size_meters FLOAT,
    kernel_radius_meters FLOAT DEFAULT NULL
) RETURNS TABLE (
    cell_id INTEGER,
    cell_geom GEOMETRY,
    density_value FLOAT,
    point_count INTEGER
) AS $$
DECLARE
    bounds GEOMETRY;
    x_min FLOAT;
    y_min FLOAT;
    x_max FLOAT;
    y_max FLOAT;
BEGIN
    -- Get the bounding box of all features in the layer
    SELECT ST_Extent(geom) INTO bounds
    FROM geoagent.geospatial_features
    WHERE layer_id = layer_id_param;

    IF bounds IS NULL THEN
        RETURN;
    END IF;

    -- Extract bounds
    x_min := ST_XMin(bounds);
    y_min := ST_YMin(bounds);
    x_max := ST_XMax(bounds);
    y_max := ST_YMax(bounds);

    -- If kernel radius not specified, use 2x cell size
    IF kernel_radius_meters IS NULL THEN
        kernel_radius_meters := cell_size_meters * 2;
    END IF;

    -- Generate grid and calculate density
    RETURN QUERY
    WITH grid AS (
        SELECT
            row_number() OVER () AS cell_id,
            ST_SetSRID(
                ST_MakeEnvelope(
                    x_min + (x * cell_size_meters / 111111.0),
                    y_min + (y * cell_size_meters / 111111.0),
                    x_min + ((x + 1) * cell_size_meters / 111111.0),
                    y_min + ((y + 1) * cell_size_meters / 111111.0)
                ),
                4326
            ) AS cell_geom
        FROM generate_series(
            0,
            floor((x_max - x_min) * 111111.0 / cell_size_meters)::INTEGER
        ) AS x,
        generate_series(
            0,
            floor((y_max - y_min) * 111111.0 / cell_size_meters)::INTEGER
        ) AS y
    )
    SELECT
        g.cell_id,
        g.cell_geom,
        COALESCE(COUNT(gf.feature_id)::FLOAT, 0) AS density_value,
        COALESCE(COUNT(gf.feature_id), 0) AS point_count
    FROM grid g
    LEFT JOIN geoagent.geospatial_features gf ON
        gf.layer_id = layer_id_param AND
        ST_DWithin(gf.geom::geography, ST_Centroid(g.cell_geom)::geography, kernel_radius_meters)
    GROUP BY g.cell_id, g.cell_geom
    HAVING COUNT(gf.feature_id) > 0;
END;
$$ LANGUAGE plpgsql;

-- Function for trajectory analysis (for tracking data)
CREATE OR REPLACE FUNCTION geoagent.analyze_trajectory(
    asset_id_param UUID,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
    total_distance_meters FLOAT,
    avg_speed_mps FLOAT,
    max_speed_mps FLOAT,
    duration_seconds FLOAT,
    point_count INTEGER,
    trajectory_line GEOMETRY
) AS $$
DECLARE
    trajectory GEOMETRY;
BEGIN
    -- Create trajectory line from tracking points
    WITH trajectory_points AS (
        SELECT
            location,
            speed,
            timestamp
        FROM geoagent.tracking_events
        WHERE
            asset_id = asset_id_param
            AND (start_time IS NULL OR timestamp >= start_time)
            AND (end_time IS NULL OR timestamp <= end_time)
        ORDER BY timestamp
    )
    SELECT
        ST_Length(ST_MakeLine(location ORDER BY timestamp)::geography) AS total_distance_meters,
        AVG(speed) AS avg_speed_mps,
        MAX(speed) AS max_speed_mps,
        EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) AS duration_seconds,
        COUNT(*) AS point_count,
        ST_MakeLine(location ORDER BY timestamp) AS trajectory_line
    INTO
        total_distance_meters,
        avg_speed_mps,
        max_speed_mps,
        duration_seconds,
        point_count,
        trajectory_line
    FROM trajectory_points;

    RETURN QUERY SELECT
        total_distance_meters,
        avg_speed_mps,
        max_speed_mps,
        duration_seconds,
        point_count,
        trajectory_line;
END;
$$ LANGUAGE plpgsql;

-- Function for geofence monitoring
CREATE OR REPLACE FUNCTION geoagent.check_geofence_triggers(
    location_param GEOMETRY,
    asset_id_param UUID,
    check_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE (
    geofence_id UUID,
    geofence_name VARCHAR(255),
    trigger_type VARCHAR(20),
    is_inside BOOLEAN
) AS $$
DECLARE
    last_location GEOMETRY;
BEGIN
    -- Get the last known location for this asset
    SELECT location INTO last_location
    FROM geoagent.tracking_events
    WHERE asset_id = asset_id_param
        AND timestamp < check_time
    ORDER BY timestamp DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
        gf.geofence_id,
        gf.name AS geofence_name,
        CASE
            WHEN ST_Contains(gf.boundary, location_param) AND
                 (last_location IS NULL OR NOT ST_Contains(gf.boundary, last_location)) THEN 'enter'
            WHEN NOT ST_Contains(gf.boundary, location_param) AND
                 last_location IS NOT NULL AND ST_Contains(gf.boundary, last_location) THEN 'exit'
            WHEN ST_Contains(gf.boundary, location_param) AND
                 last_location IS NOT NULL AND ST_Contains(gf.boundary, last_location) THEN 'dwell'
            ELSE NULL
        END AS trigger_type,
        ST_Contains(gf.boundary, location_param) AS is_inside
    FROM geoagent.geofences gf
    WHERE
        gf.active = true
        AND (gf.valid_from IS NULL OR gf.valid_from <= check_time)
        AND (gf.valid_to IS NULL OR gf.valid_to >= check_time)
        AND (
            (gf.trigger_on_enter AND ST_Contains(gf.boundary, location_param) AND
             (last_location IS NULL OR NOT ST_Contains(gf.boundary, last_location)))
            OR
            (gf.trigger_on_exit AND NOT ST_Contains(gf.boundary, location_param) AND
             last_location IS NOT NULL AND ST_Contains(gf.boundary, last_location))
            OR
            (gf.trigger_on_dwell AND ST_Contains(gf.boundary, location_param) AND
             last_location IS NOT NULL AND ST_Contains(gf.boundary, last_location))
        );
END;
$$ LANGUAGE plpgsql;

-- Function for spatial intersection analysis
CREATE OR REPLACE FUNCTION geoagent.spatial_intersection(
    layer1_id UUID,
    layer2_id UUID,
    intersection_type VARCHAR DEFAULT 'geometry' -- geometry, attributes, both
) RETURNS TABLE (
    feature1_id UUID,
    feature2_id UUID,
    intersection_geom GEOMETRY,
    intersection_area FLOAT,
    feature1_properties JSONB,
    feature2_properties JSONB,
    combined_properties JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f1.feature_id AS feature1_id,
        f2.feature_id AS feature2_id,
        ST_Intersection(f1.geom, f2.geom) AS intersection_geom,
        ST_Area(ST_Intersection(f1.geom, f2.geom)::geography) AS intersection_area,
        f1.properties AS feature1_properties,
        f2.properties AS feature2_properties,
        CASE intersection_type
            WHEN 'attributes' THEN f1.properties || f2.properties
            WHEN 'both' THEN jsonb_build_object(
                'layer1', f1.properties,
                'layer2', f2.properties,
                'intersection_area', ST_Area(ST_Intersection(f1.geom, f2.geom)::geography)
            )
            ELSE jsonb_build_object(
                'intersection_area', ST_Area(ST_Intersection(f1.geom, f2.geom)::geography)
            )
        END AS combined_properties
    FROM geoagent.geospatial_features f1
    CROSS JOIN geoagent.geospatial_features f2
    WHERE
        f1.layer_id = layer1_id
        AND f2.layer_id = layer2_id
        AND ST_Intersects(f1.geom, f2.geom)
        AND f1.feature_id != f2.feature_id;
END;
$$ LANGUAGE plpgsql;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Spatial analysis functions created successfully';
END $$;