/**
 * Spectral Processor for GeoAgent Worker
 *
 * Handles hyperspectral/multispectral image processing:
 * - Spectral unmixing (NNLS, FCLS, Sparse)
 * - Material identification via spectral library matching
 * - Vegetation indices (NDVI, EVI, SAVI)
 * - Mineral mapping
 * - Water quality analysis
 */

import { Job } from 'bullmq';
import { getMinIOClient } from '../clients/minio-client';
import { getMLServiceClient } from '../clients/ml-client';
import { getGraphRAGClient } from '../clients/graphrag-client';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SpectralJobData {
  jobId: string;
  userId: string;
  jobType: 'spectral';
  operation: 'unmix' | 'identify' | 'vegetation' | 'minerals' | 'water_quality';
  sourceUrl: string;
  metadata: Record<string, any>;
  options?: SpectralOptions;
}

export interface SpectralOptions {
  bands?: number[];
  endmembers?: string[];
  algorithm?: 'nnls' | 'fcls' | 'sparse';
  library?: 'usgs' | 'aster' | 'custom';
  indices?: ('ndvi' | 'evi' | 'savi' | 'ndwi' | 'gndvi')[];
  threshold?: number;
  outputFormat?: 'geotiff' | 'png' | 'json';
}

export interface SpectralProcessingResult {
  jobId: string;
  operation: string;
  results: {
    unmixing?: UnmixingResult;
    materials?: MaterialResult[];
    vegetation?: VegetationResult;
    minerals?: MineralResult;
    waterQuality?: WaterQualityResult;
  };
  statistics: {
    processingTimeMs: number;
    bandsProcessed: number;
    pixelsProcessed: number;
    operations: string[];
  };
  outputPaths: string[];
}

export interface UnmixingResult {
  abundances: Array<{
    endmember: string;
    mean: number;
    min: number;
    max: number;
    std: number;
  }>;
  residual: number;
  algorithm: string;
  numEndmembers: number;
}

export interface MaterialResult {
  material: string;
  confidence: number;
  spectralAngle: number;
  matchedBands: number[];
  area: number;
  centroid?: { x: number; y: number };
}

export interface VegetationResult {
  indices: Record<string, {
    mean: number;
    min: number;
    max: number;
    std: number;
    histogram: number[];
  }>;
  healthScore: number;
  coveragePercent: number;
  stressAreas: Array<{
    centroid: { x: number; y: number };
    area: number;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface MineralResult {
  minerals: Array<{
    name: string;
    confidence: number;
    abundance: number;
    locations: Array<{ x: number; y: number; area: number }>;
  }>;
  alterationZones: Array<{
    type: string;
    extent: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }>;
}

export interface WaterQualityResult {
  parameters: {
    turbidity: { value: number; unit: string; quality: string };
    chlorophyll: { value: number; unit: string; quality: string };
    sediment: { value: number; unit: string; quality: string };
    algae: { detected: boolean; coverage: number };
  };
  overallQuality: 'good' | 'moderate' | 'poor';
  alerts: string[];
}

// ============================================================================
// Main Processor
// ============================================================================

/**
 * Process spectral job
 */
export async function processSpectralJob(job: Job<SpectralJobData>): Promise<SpectralProcessingResult> {
  const { jobId, operation, sourceUrl, options = {} } = job.data;

  logger.info('Processing spectral job', {
    jobId,
    operation,
    sourceUrl,
  });

  const startTime = Date.now();

  try {
    await job.updateProgress(10);

    // Download file from MinIO
    const minioClient = getMinIOClient();
    const fileBuffer = await minioClient.downloadFile(sourceUrl);

    // Save to temp
    const tempDir = process.env.TEMP_DIR || '/tmp/geoagent';
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${jobId}_spectral.tif`);
    await fs.writeFile(tempPath, fileBuffer);

    await job.updateProgress(20);

    let result: SpectralProcessingResult;

    switch (operation) {
      case 'unmix':
        result = await handleUnmixing(job, tempPath, options);
        break;
      case 'identify':
        result = await handleMaterialIdentification(job, tempPath, options);
        break;
      case 'vegetation':
        result = await handleVegetationAnalysis(job, tempPath, options);
        break;
      case 'minerals':
        result = await handleMineralMapping(job, tempPath, options);
        break;
      case 'water_quality':
        result = await handleWaterQualityAnalysis(job, tempPath, options);
        break;
      default:
        throw new Error(`Unknown spectral operation: ${operation}`);
    }

    // Cleanup
    await fs.unlink(tempPath).catch(() => {});

    result.statistics.processingTimeMs = Date.now() - startTime;

    logger.info('Spectral processing complete', {
      jobId,
      operation,
      processingTime: `${result.statistics.processingTimeMs}ms`,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Spectral processing failed', {
      jobId,
      operation,
      error: errorMessage,
    });
    throw error;
  }
}

// ============================================================================
// Operation Handlers
// ============================================================================

/**
 * Handle spectral unmixing
 */
async function handleUnmixing(
  job: Job<SpectralJobData>,
  filePath: string,
  options: SpectralOptions
): Promise<SpectralProcessingResult> {
  const { jobId } = job.data;
  const algorithm = options.algorithm || 'nnls';

  logger.info('Performing spectral unmixing', { jobId, algorithm });

  await job.updateProgress(30);

  // Call ML service for unmixing
  const mlClient = getMLServiceClient();
  const unmixResult = await mlClient.spectralUnmix({
    filePath,
    algorithm,
    endmembers: options.endmembers,
    bands: options.bands,
  });

  await job.updateProgress(70);

  // Store results
  const minioClient = getMinIOClient();
  const outputPath = `processed/${jobId}/unmixing_results.json`;
  await minioClient.uploadFile(
    outputPath,
    Buffer.from(JSON.stringify(unmixResult)),
    { contentType: 'application/json' }
  );

  // Store in GraphRAG
  const graphragClient = getGraphRAGClient();
  await graphragClient.storeSpectralAnalysis({
    jobId,
    type: 'unmixing',
    algorithm,
    results: unmixResult,
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'unmix',
    results: {
      unmixing: {
        abundances: unmixResult.abundances || [],
        residual: unmixResult.residual || 0,
        algorithm,
        numEndmembers: unmixResult.numEndmembers || 0,
      },
    },
    statistics: {
      processingTimeMs: 0,
      bandsProcessed: options.bands?.length || 0,
      pixelsProcessed: unmixResult.pixelsProcessed || 0,
      operations: ['unmix'],
    },
    outputPaths: [outputPath],
  };
}

/**
 * Handle material identification
 */
async function handleMaterialIdentification(
  job: Job<SpectralJobData>,
  filePath: string,
  options: SpectralOptions
): Promise<SpectralProcessingResult> {
  const { jobId } = job.data;
  const library = options.library || 'usgs';

  logger.info('Performing material identification', { jobId, library });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const identifyResult = await mlClient.identifyMaterials({
    filePath,
    library,
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPath = `processed/${jobId}/materials_results.json`;
  await minioClient.uploadFile(
    outputPath,
    Buffer.from(JSON.stringify(identifyResult)),
    { contentType: 'application/json' }
  );

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeSpectralAnalysis({
    jobId,
    type: 'material_identification',
    library,
    results: identifyResult,
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'identify',
    results: {
      materials: identifyResult.materials || [],
    },
    statistics: {
      processingTimeMs: 0,
      bandsProcessed: identifyResult.bandsUsed || 0,
      pixelsProcessed: identifyResult.pixelsProcessed || 0,
      operations: ['identify'],
    },
    outputPaths: [outputPath],
  };
}

/**
 * Handle vegetation analysis
 */
async function handleVegetationAnalysis(
  job: Job<SpectralJobData>,
  filePath: string,
  options: SpectralOptions
): Promise<SpectralProcessingResult> {
  const { jobId } = job.data;
  const indices = options.indices || ['ndvi', 'evi', 'savi'];

  logger.info('Performing vegetation analysis', { jobId, indices });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const vegResult = await mlClient.calculateVegetationIndices({
    filePath,
    indices,
    threshold: options.threshold || 0.3,
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPath = `processed/${jobId}/vegetation_results.json`;
  await minioClient.uploadFile(
    outputPath,
    Buffer.from(JSON.stringify(vegResult)),
    { contentType: 'application/json' }
  );

  // Generate NDVI image if requested
  if (options.outputFormat === 'geotiff' || options.outputFormat === 'png') {
    const ndviImagePath = `processed/${jobId}/ndvi.${options.outputFormat}`;
    if (vegResult.ndviImage) {
      await minioClient.uploadFile(
        ndviImagePath,
        Buffer.from(vegResult.ndviImage, 'base64'),
        { contentType: options.outputFormat === 'geotiff' ? 'image/tiff' : 'image/png' }
      );
    }
  }

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeSpectralAnalysis({
    jobId,
    type: 'vegetation',
    indices,
    results: {
      healthScore: vegResult.healthScore,
      coveragePercent: vegResult.coveragePercent,
      stressAreas: vegResult.stressAreas?.length || 0,
    },
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'vegetation',
    results: {
      vegetation: {
        indices: vegResult.indices || {},
        healthScore: vegResult.healthScore || 0,
        coveragePercent: vegResult.coveragePercent || 0,
        stressAreas: vegResult.stressAreas || [],
      },
    },
    statistics: {
      processingTimeMs: 0,
      bandsProcessed: indices.length * 2, // Each index uses 2+ bands
      pixelsProcessed: vegResult.pixelsProcessed || 0,
      operations: indices,
    },
    outputPaths: [outputPath],
  };
}

/**
 * Handle mineral mapping
 */
async function handleMineralMapping(
  job: Job<SpectralJobData>,
  filePath: string,
  options: SpectralOptions
): Promise<SpectralProcessingResult> {
  const { jobId } = job.data;

  logger.info('Performing mineral mapping', { jobId });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const mineralResult = await mlClient.mapMinerals({
    filePath,
    library: options.library || 'usgs',
    threshold: options.threshold || 0.7,
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPath = `processed/${jobId}/mineral_results.json`;
  await minioClient.uploadFile(
    outputPath,
    Buffer.from(JSON.stringify(mineralResult)),
    { contentType: 'application/json' }
  );

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeSpectralAnalysis({
    jobId,
    type: 'mineral_mapping',
    results: {
      mineralCount: mineralResult.minerals?.length || 0,
      alterationZones: mineralResult.alterationZones?.length || 0,
    },
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'minerals',
    results: {
      minerals: {
        minerals: mineralResult.minerals || [],
        alterationZones: mineralResult.alterationZones || [],
      },
    },
    statistics: {
      processingTimeMs: 0,
      bandsProcessed: mineralResult.bandsUsed || 0,
      pixelsProcessed: mineralResult.pixelsProcessed || 0,
      operations: ['mineral_mapping'],
    },
    outputPaths: [outputPath],
  };
}

/**
 * Handle water quality analysis
 */
async function handleWaterQualityAnalysis(
  job: Job<SpectralJobData>,
  filePath: string,
  options: SpectralOptions
): Promise<SpectralProcessingResult> {
  const { jobId } = job.data;

  logger.info('Performing water quality analysis', { jobId });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const waterResult = await mlClient.analyzeWaterQuality({
    filePath,
    indices: ['ndwi', 'turbidity', 'chlorophyll'],
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPath = `processed/${jobId}/water_quality_results.json`;
  await minioClient.uploadFile(
    outputPath,
    Buffer.from(JSON.stringify(waterResult)),
    { contentType: 'application/json' }
  );

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeSpectralAnalysis({
    jobId,
    type: 'water_quality',
    results: {
      overallQuality: waterResult.overallQuality,
      alerts: waterResult.alerts?.length || 0,
    },
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'water_quality',
    results: {
      waterQuality: {
        parameters: waterResult.parameters || {
          turbidity: { value: 0, unit: 'NTU', quality: 'unknown' },
          chlorophyll: { value: 0, unit: 'ug/L', quality: 'unknown' },
          sediment: { value: 0, unit: 'mg/L', quality: 'unknown' },
          algae: { detected: false, coverage: 0 },
        },
        overallQuality: waterResult.overallQuality || 'moderate',
        alerts: waterResult.alerts || [],
      },
    },
    statistics: {
      processingTimeMs: 0,
      bandsProcessed: waterResult.bandsUsed || 0,
      pixelsProcessed: waterResult.pixelsProcessed || 0,
      operations: ['water_quality'],
    },
    outputPaths: [outputPath],
  };
}