/**
 * HyperModal Multi-Modal Fusion Routes
 *
 * Endpoints for fusing multiple data modalities:
 * - Multi-modal data fusion (LiDAR + hyperspectral + thermal)
 * - Comprehensive report generation
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getHyperModalQueue, HyperModalJobData } from '../../services/hypermodal/job-queue';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * POST /api/v1/hypermodal/fusion/multimodal
 *
 * Fuse multiple data modalities for comprehensive analysis
 */
router.post('/multimodal', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { datasets, fusion_method = 'feature_level', output_type, target_resolution } = req.body;

    if (!datasets || !Array.isArray(datasets) || datasets.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_DATASETS',
        message: 'At least 2 datasets required for fusion',
      });
    }

    if (!output_type) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_OUTPUT_TYPE',
        message: 'output_type is required (classification_map, composite_image, or feature_map)',
      });
    }

    const validFusionMethods = ['pixel_level', 'feature_level', 'decision_level'];
    if (!validFusionMethods.includes(fusion_method)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FUSION_METHOD',
        message: `Fusion method must be one of: ${validFusionMethods.join(', ')}`,
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting multi-modal fusion', {
      jobId,
      datasetCount: datasets.length,
      fusionMethod: fusion_method,
      outputType: output_type,
    });

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'fusion',
      operation: 'multimodal',
      sourceUrl: datasets.map((d: any) => d.id).join(','),
      metadata: {
        datasets,
        fusionMethod: fusion_method,
        outputType: output_type,
        targetResolution: target_resolution,
      },
      options: {
        fusion_method,
        output_type,
        target_resolution,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 9); // Highest priority for fusion

    const duration = Date.now() - startTime;

    logger.info('Multi-modal fusion job created', {
      jobId,
      datasetCount: datasets.length,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Multi-modal fusion job created (${datasets.length} datasets)`,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 45000, // 45 seconds for fusion
      datasets: datasets.map((d: any) => ({ id: d.id, type: d.type, weight: d.weight })),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Multi-modal fusion failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'FUSION_FAILED',
      message: 'Failed to create multi-modal fusion job',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/v1/hypermodal/fusion/report
 *
 * Generate comprehensive analysis report from multiple analyses
 */
router.post('/report', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { analysis_ids, report_type, include_sections = ['all'], format = 'pdf' } = req.body;

    if (!analysis_ids || !Array.isArray(analysis_ids) || analysis_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ANALYSIS_IDS',
        message: 'At least one analysis_id is required',
      });
    }

    if (!report_type) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REPORT_TYPE',
        message: 'report_type is required (executive_summary, technical_report, visual_report, comparison_report)',
      });
    }

    const jobId = uuidv4();
    const userId = (req as any).user?.userId || 'anonymous';

    logger.info('Starting report generation', {
      jobId,
      analysisCount: analysis_ids.length,
      reportType: report_type,
      format,
    });

    const jobData: HyperModalJobData = {
      jobId,
      userId,
      jobType: 'fusion',
      operation: 'report',
      sourceUrl: analysis_ids.join(','),
      metadata: {
        analysisIds: analysis_ids,
        reportType: report_type,
        includeSections: include_sections,
        format,
      },
      options: {
        report_type,
        include_sections,
        format,
      },
    };

    const queue = getHyperModalQueue();
    await queue.addJob(jobData, 8);

    const duration = Date.now() - startTime;

    logger.info('Report generation job created', {
      jobId,
      reportType: report_type,
      duration: `${duration}ms`,
    });

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Report generation job created (${report_type})`,
      statusUrl: `/api/v1/hypermodal/jobs/${jobId}`,
      estimatedTime: 60000, // 60 seconds for report generation (uses MageAgent)
      reportType: report_type,
      format,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Report generation failed', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      success: false,
      error: 'REPORT_GENERATION_FAILED',
      message: 'Failed to create report generation job',
      details: errorMessage,
    });
  }
});

export default router;
