/**
 * HyperModal Thermal Imaging Routes
 *
 * Endpoints for thermal imagery analysis:
 * - Ingestion (thermal video/images)
 * - Heat map generation
 * - Anomaly detection
 * - Temperature extraction
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getMinIOClient } from '../../services/hypermodal/minio-client';
import { getHyperModalQueue, HyperModalJobData } from '../../services/hypermodal/job-queue';
import { logger } from '../../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 * 1024 } }); // 5GB

/**
 * POST /api/v1/hypermodal/thermal/ingest
 */
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'NO_FILE_PROVIDED' });
    }

    const jobId = uuidv4();
    const minioClient = getMinIOClient();
    const objectPath = `raw/${jobId}/${req.file.originalname}`;
    const minioPath = await minioClient.uploadFile(objectPath, req.file.buffer);

    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'thermal',
      operation: 'ingest',
      sourceUrl: minioPath,
      metadata: { filename: req.file.originalname, fileSize: req.file.size },
    };

    await getHyperModalQueue().addJob(jobData, 5);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'INGESTION_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/thermal/heatmap
 */
router.post('/heatmap', async (req: Request, res: Response) => {
  try {
    const { dataset_id, temperature_range } = req.body;

    if (!dataset_id) {
      return res.status(400).json({ success: false, error: 'MISSING_DATASET_ID' });
    }

    const jobId = uuidv4();
    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'thermal',
      operation: 'heatmap',
      sourceUrl: dataset_id,
      metadata: { datasetId: dataset_id, temperatureRange: temperature_range },
      options: { temperature_range },
    };

    await getHyperModalQueue().addJob(jobData, 6);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 10000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'HEATMAP_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/thermal/anomaly
 */
router.post('/anomaly', async (req: Request, res: Response) => {
  try {
    const { dataset_id, detection_threshold = 2.0, temperature_range } = req.body;

    if (!dataset_id) {
      return res.status(400).json({ success: false, error: 'MISSING_DATASET_ID' });
    }

    const jobId = uuidv4();
    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'thermal',
      operation: 'anomaly',
      sourceUrl: dataset_id,
      metadata: {
        datasetId: dataset_id,
        detectionThreshold: detection_threshold,
        temperatureRange: temperature_range,
      },
      options: { detection_threshold, temperature_range },
    };

    await getHyperModalQueue().addJob(jobData, 7);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 5000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'ANOMALY_DETECTION_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/thermal/extract
 */
router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { dataset_id, extraction_type = 'temperature', roi } = req.body;

    if (!dataset_id) {
      return res.status(400).json({ success: false, error: 'MISSING_DATASET_ID' });
    }

    const jobId = uuidv4();
    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'thermal',
      operation: 'extract',
      sourceUrl: dataset_id,
      metadata: { datasetId: dataset_id, extractionType: extraction_type, roi },
      options: { extraction_type, roi },
    };

    await getHyperModalQueue().addJob(jobData, 6);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 8000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'EXTRACTION_FAILED', details: errorMessage });
  }
});

export default router;
