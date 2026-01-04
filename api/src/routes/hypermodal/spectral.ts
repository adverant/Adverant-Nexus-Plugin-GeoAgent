/**
 * HyperModal Hyperspectral Analysis Routes
 *
 * Endpoints for hyperspectral imagery processing:
 * - Ingestion (HDF5, ENVI format)
 * - Spectral unmixing (NMF, FCLS algorithms)
 * - Material identification (spectral library matching)
 * - Vegetation indices (NDVI, EVI, SAVI, etc.)
 * - Mineral mapping
 *
 * Pattern: Async job pattern (submit → poll → result)
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
 * POST /api/v1/hypermodal/spectral/ingest
 *
 * Ingest hyperspectral data (HDF5 or ENVI format)
 */
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'Please provide a hyperspectral data file (HDF5 or ENVI)',
      });
    }

    const filename = req.file.originalname;
    const ext = filename.toLowerCase().split('.').pop();

    if (!['hdf5', 'h5', 'img', 'hdr'].includes(ext || '')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: `Unsupported file type: .${ext}. Supported: .hdf5, .h5, .img, .hdr`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting hyperspectral ingestion', {
      jobId,
      filename,
      fileSize: req.file.size,
    });

    // Upload to MinIO
    const minioClient = getMinIOClient();
    const objectPath = `raw/${jobId}/${filename}`;
    const minioPath = await minioClient.uploadFile(objectPath, req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: {
        'original-filename': filename,
        'user-id': userId,
        'upload-timestamp': new Date().toISOString(),
      },
    });

    // Create job
    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'spectral',
      operation: 'ingest',
      sourceUrl: minioPath,
      metadata: {
        filename,
        fileSize: req.file.size,
        uploadedAt: new Date().toISOString(),
        ...JSON.parse(req.body.metadata || '{}'),
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 5);

    const duration = Date.now() - startTime;

    logger.info('Hyperspectral ingestion job created', {
      jobId,
      filename,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Hyperspectral file ingested successfully',
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 20000,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Hyperspectral ingestion failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'INGESTION_FAILED',
      message: 'Failed to ingest hyperspectral file',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/spectral/unmix
 *
 * Perform spectral unmixing to decompose mixed spectra into pure endmembers
 */
router.post('/unmix', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { dataset_id, algorithm = 'fcls', endmembers, constraints = {} } = req.body;

    if (!dataset_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASET_ID',
        message: 'dataset_id is required',
      });
    }

    const validAlgorithms = ['nnls', 'fcls', 'vca', 'n-findr'];
    if (!validAlgorithms.includes(algorithm)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ALGORITHM',
        message: `Algorithm must be one of: ${validAlgorithms.join(', ')}`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting spectral unmixing', {
      jobId,
      datasetId: dataset_id,
      algorithm,
    });

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'spectral',
      operation: 'unmix',
      sourceUrl: dataset_id,
      metadata: {
        datasetId: dataset_id,
        algorithm,
        endmembers,
        constraints,
      },
      options: {
        algorithm,
        endmembers,
        constraints,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 7);

    const duration = Date.now() - startTime;

    logger.info('Spectral unmixing job created', {
      jobId,
      algorithm,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Spectral unmixing job created (algorithm: ${algorithm})`,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 30000, // 30 seconds
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Spectral unmixing failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'UNMIXING_FAILED',
      message: 'Failed to create spectral unmixing job',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/spectral/identify
 *
 * Identify materials using spectral library matching
 */
router.post('/identify', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { dataset_id, spectral_library = 'usgs', roi } = req.body;

    if (!dataset_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASET_ID',
        message: 'dataset_id is required',
      });
    }

    const validLibraries = ['usgs', 'aster', 'custom'];
    if (!validLibraries.includes(spectral_library)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_LIBRARY',
        message: `Spectral library must be one of: ${validLibraries.join(', ')}`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'spectral',
      operation: 'identify',
      sourceUrl: dataset_id,
      metadata: {
        datasetId: dataset_id,
        spectralLibrary: spectral_library,
        roi,
      },
      options: {
        spectral_library,
        roi,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 6);

    const duration = Date.now() - startTime;

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Material identification job created (library: ${spectral_library})`,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 15000,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Material identification failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'IDENTIFICATION_FAILED',
      message: 'Failed to create material identification job',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/spectral/vegetation
 *
 * Calculate vegetation indices (NDVI, EVI, SAVI, etc.)
 */
router.post('/vegetation', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { dataset_id, indices, crop_type, growth_stage } = req.body;

    if (!dataset_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASET_ID',
        message: 'dataset_id is required',
      });
    }

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_INDICES',
        message: 'indices array is required',
      });
    }

    const validIndices = ['ndvi', 'evi', 'savi', 'ndwi', 'gndvi', 'reci', 'cvi', 'lai'];
    const invalidIndices = indices.filter(idx => !validIndices.includes(idx));

    if (invalidIndices.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INDICES',
        message: `Invalid indices: ${invalidIndices.join(', ')}. Valid: ${validIndices.join(', ')}`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'spectral',
      operation: 'vegetation',
      sourceUrl: dataset_id,
      metadata: {
        datasetId: dataset_id,
        indices,
        cropType: crop_type,
        growthStage: growth_stage,
      },
      options: {
        indices,
        crop_type,
        growth_stage,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 6);

    const duration = Date.now() - startTime;

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Vegetation indices calculation job created (${indices.length} indices)`,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 5000 + indices.length * 2000, // 5s + 2s per index
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Vegetation indices calculation failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'VEGETATION_FAILED',
      message: 'Failed to create vegetation indices job',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/spectral/minerals
 *
 * Map mineral distributions using hyperspectral data
 */
router.post('/minerals', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { dataset_id, spectral_library = 'usgs', target_minerals } = req.body;

    if (!dataset_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATASET_ID',
        message: 'dataset_id is required',
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'spectral',
      operation: 'minerals',
      sourceUrl: dataset_id,
      metadata: {
        datasetId: dataset_id,
        spectralLibrary: spectral_library,
        targetMinerals: target_minerals,
      },
      options: {
        spectral_library,
        target_minerals,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 7);

    const duration = Date.now() - startTime;

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Mineral mapping job created',
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 25000,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Mineral mapping failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'MINERAL_MAPPING_FAILED',
      message: 'Failed to create mineral mapping job',
      details: errorMessage,
    });
  }
});

export default router;
