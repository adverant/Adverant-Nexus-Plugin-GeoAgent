/**
 * HyperModal LiDAR Processing Routes
 *
 * Endpoints for LiDAR point cloud processing:
 * - Ingestion (LAS/LAZ files)
 * - Processing (DEM/DSM/CHM generation)
 * - Classification (ground/vegetation/buildings)
 * - Feature extraction (buildings, trees, power lines)
 *
 * Pattern: Follows FileProcessAgent's async job pattern
 * - POST request → Create job → Return jobId
 * - GET status → Poll job progress
 * - GET result → Retrieve final results
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getMinIOClient } from '../../services/hypermodal/minio-client';
import { getHyperModalQueue, HyperModalJobData } from '../../services/hypermodal/job-queue';
import { getHyperModalStorage } from '../../services/hypermodal/graphrag-storage';
import { logger } from '../../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB max

/**
 * POST /api/v1/hypermodal/lidar/ingest
 *
 * Ingest LAS/LAZ LiDAR file for processing
 */
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'Please provide a LAS or LAZ file',
      });
    }

    // Validate file type
    const filename = req.file.originalname;
    const ext = filename.toLowerCase().split('.').pop();

    if (ext !== 'las' && ext !== 'laz') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: `Unsupported file type: .${ext}. Only .las and .laz files are supported.`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting LiDAR ingestion', {
      jobId,
      filename,
      fileSize: req.file.size,
      userId,
    });

    // Upload to MinIO
    const minioClient = getMinIOClient();
    const objectPath = `raw/${jobId}/${filename}`;
    const minioPath = await minioClient.uploadFile(
      objectPath,
      req.file.buffer,
      {
        contentType: req.file.mimetype,
        metadata: {
          'original-filename': filename,
          'user-id': userId,
          'upload-timestamp': new Date().toISOString(),
        },
      }
    );

    // Create job data
    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'lidar',
      operation: 'ingest',
      sourceUrl: minioPath,
      metadata: {
        filename,
        fileSize: req.file.size,
        uploadedAt: new Date().toISOString(),
        ...JSON.parse(req.body.metadata || '{}'),
      },
    };

    // Add to queue
    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 5);

    const duration = Date.now() - startTime;

    logger.info('LiDAR ingestion job created', {
      jobId,
      filename,
      minioPath,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'LiDAR file ingested successfully',
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 30000, // 30 seconds estimate
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('LiDAR ingestion failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'INGESTION_FAILED',
      message: 'Failed to ingest LiDAR file',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/lidar/process
 *
 * Process ingested LiDAR data (DEM/DSM/CHM generation, classification, extraction)
 */
router.post('/process', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { dataset_id, operations, resolution = 1.0, output_format = 'geotiff' } = req.body;

    // Validate input
    if (!dataset_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASET_ID',
        message: 'dataset_id is required',
      });
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_OPERATIONS',
        message: 'operations array is required',
      });
    }

    const validOperations = ['dem', 'dsm', 'chm', 'classify_ground', 'extract_buildings', 'extract_vegetation'];
    const invalidOps = operations.filter(op => !validOperations.includes(op));

    if (invalidOps.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OPERATIONS',
        message: `Invalid operations: ${invalidOps.join(', ')}. Valid: ${validOperations.join(', ')}`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting LiDAR processing', {
      jobId,
      datasetId: dataset_id,
      operations,
      resolution,
      userId,
    });

    // Create processing job
    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'lidar',
      operation: 'process',
      sourceUrl: dataset_id, // Reference to ingested dataset
      metadata: {
        datasetId: dataset_id,
        operations,
        resolution,
        outputFormat: output_format,
      },
      options: {
        operations,
        resolution,
        output_format,
      },
    };

    // Add to queue with higher priority for processing jobs
    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 7);

    const duration = Date.now() - startTime;

    // Estimate processing time based on operations
    const baseTime = 15000; // 15 seconds base
    const operationTime = operations.length * 10000; // 10 seconds per operation
    const estimatedTime = baseTime + operationTime;

    logger.info('LiDAR processing job created', {
      jobId,
      datasetId: dataset_id,
      operations,
      estimatedTime: `${estimatedTime}ms`,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'LiDAR processing job created',
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime,
      operations,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('LiDAR processing failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'PROCESSING_FAILED',
      message: 'Failed to create LiDAR processing job',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/v1/hypermodal/lidar/datasets/:datasetId
 *
 * Get information about an ingested LiDAR dataset
 */
router.get('/datasets/:datasetId', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { datasetId } = req.params;

  try {
    // This would query PostgreSQL for dataset info
    // For now, return placeholder
    const duration = Date.now() - startTime;

    logger.info('Retrieved LiDAR dataset info', {
      datasetId,
      duration: `${duration}ms`,
    });

    res.status(200).json({
      success: true,
      dataset: {
        id: datasetId,
        type: 'lidar',
        status: 'ingested',
        message: 'Dataset info retrieval not yet fully implemented',
        // In Phase 3, this will query PostgreSQL for actual data
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Failed to get LiDAR dataset info', {
      datasetId,
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'QUERY_FAILED',
      message: 'Failed to retrieve dataset information',
      details: errorMessage,
    });
  }
});

export default router;
