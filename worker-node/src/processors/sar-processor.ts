/**
 * SAR (Synthetic Aperture Radar) Processor for GeoAgent Worker
 *
 * Handles SAR data processing:
 * - InSAR interferometric processing
 * - Coherence calculation for change detection
 * - Multi-temporal change detection
 * - Deformation mapping
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

export interface SARJobData {
  jobId: string;
  userId: string;
  jobType: 'sar';
  operation: 'interferometry' | 'coherence' | 'change_detection';
  sourceUrls: string[];
  metadata: Record<string, any>;
  options?: SAROptions;
}

export interface SAROptions {
  multilook?: { range: number; azimuth: number };
  filtering?: 'goldstein' | 'boxcar' | 'lee';
  threshold?: number;
  method?: 'amplitude' | 'coherence' | 'hybrid';
}

export interface SARProcessingResult {
  jobId: string;
  operation: string;
  results: Record<string, any>;
  statistics: {
    processingTimeMs: number;
    imagesProcessed: number;
    pixelsProcessed: number;
    operations: string[];
  };
  outputPaths: string[];
}

// ============================================================================
// Main Processor
// ============================================================================

export async function processSARJob(job: Job<SARJobData>): Promise<SARProcessingResult> {
  const { jobId, operation, sourceUrls, options = {} } = job.data;

  logger.info('Processing SAR job', { jobId, operation, imageCount: sourceUrls?.length || 0 });

  const startTime = Date.now();

  try {
    await job.updateProgress(10);

    // Download files from MinIO
    const minioClient = getMinIOClient();
    const tempDir = process.env.TEMP_DIR || '/tmp/geoagent';
    await fs.mkdir(tempDir, { recursive: true });

    const tempPaths: string[] = [];
    const urls = sourceUrls || [];
    for (let i = 0; i < urls.length; i++) {
      const fileBuffer = await minioClient.downloadFile(urls[i]);
      const tempPath = path.join(tempDir, `${jobId}_sar_${i}.tif`);
      await fs.writeFile(tempPath, fileBuffer);
      tempPaths.push(tempPath);
    }

    await job.updateProgress(30);

    const mlClient = getMLServiceClient();
    const graphragClient = getGraphRAGClient();
    const outputPaths: string[] = [];
    let results: Record<string, any> = {};

    switch (operation) {
      case 'interferometry': {
        if (tempPaths.length < 2) {
          throw new Error('Interferometry requires at least 2 SAR images');
        }
        const insarResult = await mlClient.processInterferometry({
          filePaths: tempPaths,
          multilook: options.multilook,
          filtering: options.filtering,
        });
        results = {
          phaseMap: insarResult.phase,
          coherenceMap: insarResult.coherence,
          deformation: insarResult.deformation,
        };
        await graphragClient.storeSARAnalysis({
          jobId,
          operation: 'interferometry',
          results,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'coherence': {
        if (tempPaths.length < 2) {
          throw new Error('Coherence calculation requires at least 2 SAR images');
        }
        const cohResult = await mlClient.calculateCoherence({
          filePaths: tempPaths,
          windowSize: options.multilook?.range || 5,
        });
        results = {
          coherenceMap: cohResult.coherenceMap,
          statistics: cohResult.statistics,
          qualityAssessment: cohResult.statistics?.mean >= 0.6 ? 'good' : 'moderate',
        };
        await graphragClient.storeSARAnalysis({
          jobId,
          operation: 'coherence',
          results,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'change_detection': {
        if (tempPaths.length < 2) {
          throw new Error('Change detection requires at least 2 SAR images');
        }
        const changeResult = await mlClient.detectSARChanges({
          filePaths: tempPaths,
          threshold: options.threshold || 0.3,
          method: options.method || 'amplitude',
        });
        results = {
          changes: changeResult.changes,
          changeMap: changeResult.changeMap,
          statistics: changeResult.statistics,
        };
        await graphragClient.storeSARAnalysis({
          jobId,
          operation: 'change_detection',
          results: { changesCount: changeResult.changes?.length || 0 },
          timestamp: new Date().toISOString(),
        });
        break;
      }

      default:
        throw new Error(`Unknown SAR operation: ${operation}`);
    }

    await job.updateProgress(80);

    // Cleanup temp files
    for (const tempPath of tempPaths) {
      await fs.unlink(tempPath).catch(() => {});
    }

    await job.updateProgress(100);

    const processingTime = Date.now() - startTime;

    logger.info('SAR processing complete', {
      jobId,
      operation,
      processingTime: `${processingTime}ms`,
    });

    return {
      jobId,
      operation,
      results,
      statistics: {
        processingTimeMs: processingTime,
        imagesProcessed: urls.length,
        pixelsProcessed: results.pixelsProcessed || 0,
        operations: [operation],
      },
      outputPaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('SAR processing failed', { jobId, operation, error: errorMessage });
    throw error;
  }
}