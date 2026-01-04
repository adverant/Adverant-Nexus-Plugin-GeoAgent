-- Migration 006: Add HyperModal Tables
-- Description: Create tables for HyperModal multi-modal geospatial data processing
-- Date: 2025-11-05

-- ============================================================================
-- Job Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.hypermodal_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('lidar', 'spectral', 'sar', 'thermal', 'fusion')),
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
    source_url TEXT NOT NULL,
    output_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    options JSONB DEFAULT '{}'::jsonb,
    result JSONB,
    error_code VARCHAR(100),
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_hypermodal_jobs_job_id ON geoagent.hypermodal_jobs(job_id);
CREATE INDEX idx_hypermodal_jobs_user_id ON geoagent.hypermodal_jobs(user_id);
CREATE INDEX idx_hypermodal_jobs_type_status ON geoagent.hypermodal_jobs(job_type, status);
CREATE INDEX idx_hypermodal_jobs_created_at ON geoagent.hypermodal_jobs(created_at DESC);

COMMENT ON TABLE geoagent.hypermodal_jobs IS 'Job tracking for HyperModal geospatial processing';

-- ============================================================================
-- LiDAR Datasets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.lidar_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES geoagent.hypermodal_jobs(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT,
    point_count BIGINT,
    bounds JSONB,
    crs VARCHAR(100),
    point_format INTEGER,
    version VARCHAR(20),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lidar_datasets_job_id ON geoagent.lidar_datasets(job_id);
CREATE INDEX idx_lidar_datasets_created_at ON geoagent.lidar_datasets(created_at DESC);

COMMENT ON TABLE geoagent.lidar_datasets IS 'LiDAR point cloud dataset metadata';

-- ============================================================================
-- LiDAR Products Table (DEM/DSM/CHM outputs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.lidar_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES geoagent.lidar_datasets(id) ON DELETE CASCADE,
    product_type VARCHAR(50) NOT NULL CHECK (product_type IN ('dem', 'dsm', 'chm', 'intensity', 'classification', 'buildings', 'vegetation')),
    resolution FLOAT NOT NULL,
    output_url TEXT NOT NULL,
    output_format VARCHAR(50) NOT NULL,
    statistics JSONB DEFAULT '{}'::jsonb,
    bounds JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lidar_products_dataset_id ON geoagent.lidar_products(dataset_id);
CREATE INDEX idx_lidar_products_type ON geoagent.lidar_products(product_type);

COMMENT ON TABLE geoagent.lidar_products IS 'LiDAR processing products (DEM, DSM, CHM, etc.)';

-- ============================================================================
-- Hyperspectral Datasets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.spectral_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES geoagent.hypermodal_jobs(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT,
    num_bands INTEGER NOT NULL,
    wavelengths JSONB,
    dimensions JSONB NOT NULL,
    sensor VARCHAR(100),
    acquisition_date TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spectral_datasets_job_id ON geoagent.spectral_datasets(job_id);
CREATE INDEX idx_spectral_datasets_created_at ON geoagent.spectral_datasets(created_at DESC);

COMMENT ON TABLE geoagent.spectral_datasets IS 'Hyperspectral imagery dataset metadata';

-- ============================================================================
-- SAR Datasets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.sar_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES geoagent.hypermodal_jobs(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT,
    polarization VARCHAR(20),
    sensor VARCHAR(100),
    acquisition_date TIMESTAMPTZ,
    incidence_angle FLOAT,
    orbit_direction VARCHAR(20),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sar_datasets_job_id ON geoagent.sar_datasets(job_id);
CREATE INDEX idx_sar_datasets_acquisition_date ON geoagent.sar_datasets(acquisition_date DESC);

COMMENT ON TABLE geoagent.sar_datasets IS 'SAR imagery dataset metadata';

-- ============================================================================
-- Thermal Datasets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geoagent.thermal_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES geoagent.hypermodal_jobs(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT,
    temperature_range JSONB,
    resolution VARCHAR(50),
    sensor VARCHAR(100),
    acquisition_date TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_thermal_datasets_job_id ON geoagent.thermal_datasets(job_id);
CREATE INDEX idx_thermal_datasets_created_at ON geoagent.thermal_datasets(created_at DESC);

COMMENT ON TABLE geoagent.thermal_datasets IS 'Thermal imagery dataset metadata';

-- ============================================================================
-- Update Trigger for hypermodal_jobs
-- ============================================================================

CREATE OR REPLACE FUNCTION update_hypermodal_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hypermodal_jobs_updated_at
    BEFORE UPDATE ON geoagent.hypermodal_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_hypermodal_jobs_updated_at();

-- ============================================================================
-- Grants (adjust as needed for your setup)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA geoagent TO unified_brain;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA geoagent TO unified_brain;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables created
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'geoagent'
  AND table_name LIKE '%hypermodal%' OR table_name LIKE '%lidar%' OR table_name LIKE '%spectral%' OR table_name LIKE '%sar%' OR table_name LIKE '%thermal%'
ORDER BY table_name;

-- Sample usage
-- INSERT INTO geoagent.hypermodal_jobs (job_id, user_id, job_type, operation, source_url)
-- VALUES ('test-job-1', 'user-123', 'lidar', 'process', 'minio://bucket/path.las');
