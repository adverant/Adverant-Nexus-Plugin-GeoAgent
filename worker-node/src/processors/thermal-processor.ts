/**
 * Thermal Processor for GeoAgent Worker
 *
 * Handles thermal/infrared image processing:
 * - Heat map generation
 * - Thermal anomaly detection
 * - Temperature extraction
 * - Urban heat island analysis
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

export interface ThermalJobData {
  jobId: string;
  userId: string;
  jobType: 'thermal';
  operation: 'heatmap' | 'anomaly_detection' | 'temperature_extract';
  sourceUrl: string;
  metadata: Record<string, any>;
  options?: ThermalOptions;
}

export interface ThermalOptions {
  temperatureUnit?: 'celsius' | 'fahrenheit' | 'kelvin';
  anomalyThreshold?: number;
  colorMap?: 'jet' | 'inferno' | 'plasma' | 'viridis';
  regions?: Array<{ x: number; y: number; radius: number }>;
  calibration?: {
    emissivity?: number;
    atmosphericCorrection?: boolean;
  };
}

export interface ThermalProcessingResult {
  jobId: string;
  operation: string;
  results: {
    heatmap?: HeatmapResult;
    anomalies?: AnomalyResult;
    temperatures?: TemperatureResult;
  };
  statistics: {
    processingTimeMs: number;
    pixelsProcessed: number;
    operations: string[];
  };
  outputPaths: string[];
}

export interface HeatmapResult {
  heatmapImage: string; // MinIO path
  statistics: {
    minTemp: number;
    maxTemp: number;
    meanTemp: number;
    stdTemp: number;
  };
  unit: string;
  colorMap: string;
}

export interface AnomalyResult {
  anomalies: Array<{
    id: string;
    location: { x: number; y: number };
    temperature: number;
    deviation: number;
    area: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: 'hot_spot' | 'cold_spot' | 'gradient';
  }>;
  anomalyMap: string;
  statistics: {
    totalAnomalies: number;
    hotSpots: number;
    coldSpots: number;
    averageDeviation: number;
  };
}

export interface TemperatureResult {
  temperatures: Array<{
    regionId: string;
    location: { x: number; y: number };
    temperature: number;
    unit: string;
    confidence: number;
  }>;
  statistics: {
    min: number;
    max: number;
    mean: number;
    std: number;
  };
}

// ============================================================================
// Main Processor
// ============================================================================

export async function processThermalJob(job: Job<ThermalJobData>): Promise<ThermalProcessingResult> {
  const { jobId, operation, sourceUrl, options = {} } = job.data;

  logger.info('Processing thermal job', { jobId, operation, sourceUrl });

  const startTime = Date.now();

  try {
    await job.updateProgress(10);

    // Download file from MinIO
    const minioClient = getMinIOClient();
    const fileBuffer = await minioClient.downloadFile(sourceUrl);

    const tempDir = process.env.TEMP_DIR || '/tmp/geoagent';
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${jobId}_thermal.tif`);
    await fs.writeFile(tempPath, fileBuffer);

    await job.updateProgress(20);

    let result: ThermalProcessingResult;

    switch (operation) {
      case 'heatmap':
        result = await handleHeatmap(job, tempPath, options);
        break;
      case 'anomaly_detection':
        result = await handleAnomalyDetection(job, tempPath, options);
        break;
      case 'temperature_extract':
        result = await handleTemperatureExtraction(job, tempPath, options);
        break;
      default:
        throw new Error(`Unknown thermal operation: ${operation}`);
    }

    // Cleanup
    await fs.unlink(tempPath).catch(() => {});

    result.statistics.processingTimeMs = Date.now() - startTime;

    logger.info('Thermal processing complete', {
      jobId,
      operation,
      processingTime: `${result.statistics.processingTimeMs}ms`,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Thermal processing failed', { jobId, operation, error: errorMessage });
    throw error;
  }
}

// ============================================================================
// Operation Handlers
// ============================================================================

async function handleHeatmap(
  job: Job<ThermalJobData>,
  filePath: string,
  options: ThermalOptions
): Promise<ThermalProcessingResult> {
  const { jobId } = job.data;

  logger.info('Generating heat map', { jobId, colorMap: options.colorMap });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const heatmapResult = await mlClient.generateHeatmap({
    filePath,
    colorMap: options.colorMap || 'inferno',
    temperatureUnit: options.temperatureUnit || 'celsius',
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPaths: string[] = [];

  const heatmapPath = `processed/${jobId}/heatmap.png`;
  if (heatmapResult.heatmapImage) {
    await minioClient.uploadFile(
      heatmapPath,
      Buffer.from(heatmapResult.heatmapImage, 'base64'),
      { contentType: 'image/png' }
    );
    outputPaths.push(heatmapPath);
  }

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeThermalAnalysis({
    jobId,
    operation: 'heatmap',
    results: heatmapResult.statistics,
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'heatmap',
    results: {
      heatmap: {
        heatmapImage: heatmapPath,
        statistics: heatmapResult.statistics || { minTemp: 0, maxTemp: 0, meanTemp: 0, stdTemp: 0 },
        unit: options.temperatureUnit || 'celsius',
        colorMap: options.colorMap || 'inferno',
      },
    },
    statistics: {
      processingTimeMs: 0,
      pixelsProcessed: heatmapResult.pixelsProcessed || 0,
      operations: ['heatmap'],
    },
    outputPaths,
  };
}

async function handleAnomalyDetection(
  job: Job<ThermalJobData>,
  filePath: string,
  options: ThermalOptions
): Promise<ThermalProcessingResult> {
  const { jobId } = job.data;

  logger.info('Detecting thermal anomalies', { jobId, threshold: options.anomalyThreshold });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const anomalyResult = await mlClient.detectAnomalies({
    filePath,
    threshold: options.anomalyThreshold || 2.0, // 2 standard deviations
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPaths: string[] = [];

  const anomalyMapPath = `processed/${jobId}/anomaly_map.png`;
  if (anomalyResult.anomalyMap) {
    await minioClient.uploadFile(
      anomalyMapPath,
      Buffer.from(anomalyResult.anomalyMap, 'base64'),
      { contentType: 'image/png' }
    );
    outputPaths.push(anomalyMapPath);
  }

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeThermalAnalysis({
    jobId,
    operation: 'anomaly_detection',
    results: {
      anomalyCount: anomalyResult.anomalies?.length || 0,
      hotSpots: anomalyResult.anomalies?.filter((a: any) => a.type === 'hot_spot').length || 0,
      coldSpots: anomalyResult.anomalies?.filter((a: any) => a.type === 'cold_spot').length || 0,
    },
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'anomaly_detection',
    results: {
      anomalies: {
        anomalies: anomalyResult.anomalies || [],
        anomalyMap: anomalyMapPath,
        statistics: {
          totalAnomalies: anomalyResult.anomalies?.length || 0,
          hotSpots: anomalyResult.anomalies?.filter((a: any) => a.type === 'hot_spot').length || 0,
          coldSpots: anomalyResult.anomalies?.filter((a: any) => a.type === 'cold_spot').length || 0,
          averageDeviation: anomalyResult.statistics?.averageDeviation || 0,
        },
      },
    },
    statistics: {
      processingTimeMs: 0,
      pixelsProcessed: anomalyResult.pixelsProcessed || 0,
      operations: ['anomaly_detection'],
    },
    outputPaths,
  };
}

async function handleTemperatureExtraction(
  job: Job<ThermalJobData>,
  filePath: string,
  options: ThermalOptions
): Promise<ThermalProcessingResult> {
  const { jobId } = job.data;

  logger.info('Extracting temperatures', { jobId, regions: options.regions?.length || 0 });

  await job.updateProgress(30);

  const mlClient = getMLServiceClient();
  const tempResult = await mlClient.extractTemperatures({
    filePath,
    calibration: options.calibration,
    regions: options.regions,
  });

  await job.updateProgress(70);

  const minioClient = getMinIOClient();
  const outputPaths: string[] = [];

  // Store results JSON
  const resultPath = `processed/${jobId}/temperatures.json`;
  await minioClient.uploadFile(
    resultPath,
    Buffer.from(JSON.stringify(tempResult)),
    { contentType: 'application/json' }
  );
  outputPaths.push(resultPath);

  const graphragClient = getGraphRAGClient();
  await graphragClient.storeThermalAnalysis({
    jobId,
    operation: 'temperature_extract',
    results: tempResult.statistics,
    timestamp: new Date().toISOString(),
  });

  await job.updateProgress(100);

  return {
    jobId,
    operation: 'temperature_extract',
    results: {
      temperatures: {
        temperatures: tempResult.temperatures || [],
        statistics: tempResult.statistics || { min: 0, max: 0, mean: 0, std: 0 },
      },
    },
    statistics: {
      processingTimeMs: 0,
      pixelsProcessed: tempResult.pixelsProcessed || 0,
      operations: ['temperature_extract'],
    },
    outputPaths,
  };
}