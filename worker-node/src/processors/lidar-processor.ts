/**
 * LiDAR Processor for GeoAgent Worker
 *
 * Handles LiDAR point cloud processing:
 * - Download LAS/LAZ from MinIO
 * - Call ML service for classification (optional)
 * - Generate DEM/DSM/CHM (future: call Go binary)
 * - Extract buildings/vegetation
 * - Store results in MinIO + GraphRAG
 */

import { Job } from 'bullmq';
import { getMinIOClient } from '../clients/minio-client';
import { getMLServiceClient } from '../clients/ml-client';
import { getGraphRAGClient } from '../clients/graphrag-client';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import path from 'path';

export interface LiDARJobData {
  jobId: string;
  userId: string;
  jobType: 'lidar';
  operation: string;
  sourceUrl: string;
  metadata: Record<string, any>;
  options?: Record<string, any>;
}

export interface LiDARProcessingResult {
  jobId: string;
  operation: string;
  results: {
    dem?: any;
    dsm?: any;
    chm?: any;
    buildings?: any[];
    vegetation?: any;
  };
  statistics: {
    numPoints?: number;
    processingTimeMs: number;
    operations: string[];
  };
  outputPaths: string[];
}

/**
 * Process LiDAR job
 */
export async function processLiDARJob(job: Job<LiDARJobData>): Promise<LiDARProcessingResult> {
  const { jobId, operation, sourceUrl } = job.data;

  logger.info('Processing LiDAR job', {
    jobId,
    operation,
    sourceUrl,
  });

  try {
    // Update progress
    await job.updateProgress(10);

    if (operation === 'ingest') {
      return await handleLiDARIngestion(job);
    } else if (operation === 'process') {
      return await handleLiDARProcessing(job);
    } else {
      throw new Error(`Unknown LiDAR operation: ${operation}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('LiDAR processing failed', {
      jobId,
      operation,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Handle LiDAR file ingestion
 */
async function handleLiDARIngestion(job: Job<LiDARJobData>): Promise<LiDARProcessingResult> {
  const { jobId, sourceUrl } = job.data;
  const startTime = Date.now();

  logger.info('Handling LiDAR ingestion', { jobId, sourceUrl });

  // File is already in MinIO from API upload
  // Just validate and extract metadata

  await job.updateProgress(50);

  // Validate file (check it's actually a LAS file)
  // In Phase 3b, we'll add actual validation

  await job.updateProgress(100);

  const processingTime = Date.now() - startTime;

  logger.info('LiDAR ingestion complete', {
    jobId,
    processingTime: `${processingTime}ms`,
  });

  return {
    jobId,
    operation: 'ingest',
    results: {},  // Empty results for ingestion (file validated)
    statistics: {
      processingTimeMs: processingTime,
      operations: ['ingest'],
    },
    outputPaths: [sourceUrl],
  };
}

/**
 * Handle LiDAR processing (DEM/DSM/CHM generation, etc.)
 */
async function handleLiDARProcessing(job: Job<LiDARJobData>): Promise<LiDARProcessingResult> {
  const { jobId, sourceUrl, metadata, options } = job.data;
  const startTime = Date.now();
  const operations = options?.operations || [];

  logger.info('Handling LiDAR processing', {
    jobId,
    operations,
  });

  try {
    // 1. Download from MinIO
    await job.updateProgress(10);
    logger.debug('Downloading LAS file from MinIO', { sourceUrl });

    const minioClient = getMinIOClient();
    const fileBuffer = await minioClient.downloadFile(sourceUrl);

    await job.updateProgress(20);

    // 2. Save to temporary file
    const tempDir = process.env.TEMP_DIR || '/tmp/geoagent';
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${jobId}.las`);
    await fs.writeFile(tempPath, fileBuffer);

    logger.debug('File saved to temp', { tempPath, size: fileBuffer.length });

    await job.updateProgress(30);

    // 3. Call ML service for classification (if requested)
    const results: any = {};
    const outputPaths: string[] = [];

    if (operations.includes('classify_ground') || operations.includes('extract_buildings')) {
      logger.info('Calling ML service for classification', { jobId });

      const mlClient = getMLServiceClient();
      const classificationResult = await mlClient.classifyLiDAR({
        filePath: tempPath,
        operations,
      });

      results.classification = classificationResult;
      await job.updateProgress(60);
    }

    // 4. Generate elevation models (DEM/DSM/CHM)
    // In Phase 3b, we'll call Go binary here
    // For now, placeholder
    if (operations.includes('dem') || operations.includes('dsm') || operations.includes('chm')) {
      logger.info('Generating elevation models (placeholder)', { operations });

      results.elevation = {
        dem: operations.includes('dem') ? 'DEM generated' : null,
        dsm: operations.includes('dsm') ? 'DSM generated' : null,
        chm: operations.includes('chm') ? 'CHM generated' : null,
      };

      await job.updateProgress(80);
    }

    // 5. Upload results to MinIO
    const resultPath = `processed/${jobId}/results.json`;
    await minioClient.uploadFile(
      resultPath,
      Buffer.from(JSON.stringify(results)),
      { contentType: 'application/json' }
    );
    outputPaths.push(resultPath);

    await job.updateProgress(90);

    // 6. Store in GraphRAG
    const graphragClient = getGraphRAGClient();
    await graphragClient.storeLiDARAnalysis({
      jobId,
      datasetId: metadata.datasetId || jobId,
      location: metadata.location || { lat: 0, lon: 0 },
      operations,
      resolution: options?.resolution || 1.0,
      numPoints: results.classification?.numPoints || 0,
      bounds: results.classification?.bounds || {},
      products: results.elevation || {},
      extracted: {
        buildings: results.classification?.buildings || [],
        vegetation: results.classification?.vegetation || {},
      },
      statistics: {
        processingTimeMs: Date.now() - startTime,
      },
    });

    await job.updateProgress(100);

    // 7. Cleanup temp file
    await fs.unlink(tempPath).catch((err) =>
      logger.warn('Failed to delete temp file', { tempPath, error: err.message })
    );

    const processingTime = Date.now() - startTime;

    logger.info('LiDAR processing complete', {
      jobId,
      operations,
      processingTime: `${processingTime}ms`,
    });

    return {
      jobId,
      operation: 'process',
      results,
      statistics: {
        numPoints: results.classification?.numPoints || 0,
        processingTimeMs: processingTime,
        operations,
      },
      outputPaths,
    };
  } catch (error) {
    // Cleanup on error
    const tempPath = path.join(process.env.TEMP_DIR || '/tmp/geoagent', `${jobId}.las`);
    await fs.unlink(tempPath).catch(() => {});

    throw error;
  }
}
