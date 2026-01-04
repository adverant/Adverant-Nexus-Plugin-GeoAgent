/**
 * HyperModal SAR Processing Routes
 *
 * Endpoints for Synthetic Aperture Radar processing:
 * - Ingestion (SAR imagery)
 * - Interferometry (InSAR for ground deformation)
 * - Coherence calculation
 * - Change detection
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getMinIOClient } from '../../services/hypermodal/minio-client';
import { getHyperModalQueue, HyperModalJobData } from '../../services/hypermodal/job-queue';
import { logger } from '../../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

/**
 * POST /api/v1/hypermodal/sar/ingest
 */
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'Please provide a SAR data file',
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';
    const filename = req.file.originalname;

    const minioClient = getMinIOClient();
    const objectPath = `raw/${jobId}/${filename}`;
    const minioPath = await minioClient.uploadFile(objectPath, req.file.buffer, {
      contentType: req.file.mimetype,
    });

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'sar',
      operation: 'ingest',
      sourceUrl: minioPath,
      metadata: {
        filename,
        fileSize: req.file.size,
        ...JSON.parse(req.body.metadata || '{}'),
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 5);

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 20000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('SAR ingestion failed', { error: errorMessage });
    res.status(500).json({ success: false, error: 'INGESTION_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/sar/interferometry
 */
router.post('/interferometry', async (req: Request, res: Response) => {
  try {
    const { dataset_ids, temporal_baseline, filters = {} } = req.body;

    if (!dataset_ids || !Array.isArray(dataset_ids) || dataset_ids.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATASET_IDS',
        message: 'At least 2 SAR datasets required for interferometry',
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'sar',
      operation: 'interferometry',
      sourceUrl: dataset_ids.join(','),
      metadata: { datasetIds: dataset_ids, temporalBaseline: temporal_baseline, filters },
      options: { temporal_baseline, filters },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 8);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 60000, // InSAR takes longer
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'INTERFEROMETRY_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/sar/coherence
 */
router.post('/coherence', async (req: Request, res: Response) => {
  try {
    const { dataset_ids } = req.body;

    if (!dataset_ids || dataset_ids.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATASET_IDS',
        message: 'At least 2 SAR datasets required for coherence calculation',
      });
    }

    const jobId = uuidv4();
    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'sar',
      operation: 'coherence',
      sourceUrl: dataset_ids.join(','),
      metadata: { datasetIds: dataset_ids },
    };

    await getHyperModalQueue().addJob(jobData, 7);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 40000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'COHERENCE_FAILED', details: errorMessage });
  }
});

/**
 * POST /api/v1/hypermodal/sar/change
 */
router.post('/change', async (req: Request, res: Response) => {
  try {
    const { before_dataset, after_dataset, method = 'image_differencing' } = req.body;

    if (!before_dataset || !after_dataset) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASETS',
        message: 'before_dataset and after_dataset are required',
      });
    }

    const jobId = uuidv4();
    const jobData: HyperModalJobData = {
      jobId,
      userId: (req as any).user?.userId || 'anonymous',
      jobType: 'sar',
      operation: 'change',
      sourceUrl: `${before_dataset},${after_dataset}`,
      metadata: { beforeDataset: before_dataset, afterDataset: after_dataset, method },
      options: { method },
    };

    await getHyperModalQueue().addJob(jobData, 7);

    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 30000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: 'CHANGE_DETECTION_FAILED', details: errorMessage });
  }
});

export default router;
