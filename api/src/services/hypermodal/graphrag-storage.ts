/**
 * GraphRAG Storage Service for HyperModal Analysis Results
 *
 * Stores all geospatial analysis results in GraphRAG for:
 * - Long-term knowledge retention
 * - Semantic search across analyses
 * - Historical pattern recognition
 * - Cross-analysis insights
 *
 * Adapted from FileProcessAgent's GraphRAGClient with geospatial-specific schemas.
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from '../../utils/logger';

export interface LiDARAnalysisResult {
  jobId: string;
  datasetId: string;
  location: { lat: number; lon: number };
  operations: string[];
  resolution: number;
  numPoints: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  products: {
    dem?: any;
    dsm?: any;
    chm?: any;
  };
  extracted: {
    buildings?: any[];
    vegetation?: any;
  };
  statistics: Record<string, any>;
}

export interface SpectralAnalysisResult {
  jobId: string;
  datasetId: string;
  location: { lat: number; lon: number };
  analysisType: string;
  numBands: number;
  wavelengths?: number[];
  unmixing?: {
    endmembers: any[];
    abundances: any[];
    error: number;
  };
  materials?: any[];
  indices?: Record<string, any>;
}

/**
 * GraphRAG Storage Manager for HyperModal
 */
export class HyperModalGraphRAGStorage {
  private client: AxiosInstance;
  private readonly baseURL: string;

  constructor(graphragUrl?: string) {
    this.baseURL = graphragUrl || process.env.GRAPHRAG_URL || 'http://nexus-graphrag:8090';

    // Create axios instance with retry logic
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Configure exponential backoff retry
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ? error.response.status >= 500 : false)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn(`GraphRAG request retry ${retryCount}`, {
          url: requestConfig.url,
          method: requestConfig.method,
          error: error.message,
        });
      },
    });

    logger.info('HyperModalGraphRAGStorage initialized', {
      baseURL: this.baseURL,
    });
  }

  /**
   * Store LiDAR analysis results in GraphRAG
   */
  async storeLiDARAnalysis(analysis: LiDARAnalysisResult): Promise<string> {
    try {
      logger.debug('Storing LiDAR analysis in GraphRAG', {
        jobId: analysis.jobId,
        location: analysis.location,
        operations: analysis.operations,
      });

      // Generate markdown report
      const report = this.generateLiDARMarkdownReport(analysis);

      // Store as document
      const docResponse = await this.client.post('/api/documents', {
        content: report,
        title: `LiDAR Analysis - ${analysis.location.lat},${analysis.location.lon} - ${new Date().toISOString()}`,
        metadata: {
          type: 'lidar_analysis',
          datasetId: analysis.datasetId,
          jobId: analysis.jobId,
          location: analysis.location,
          operations: analysis.operations,
          resolution: analysis.resolution,
          numPoints: analysis.numPoints,
          bounds: analysis.bounds,
        },
      });

      const documentId = docResponse.data.documentId || docResponse.data.data?.memory_id;

      // Store detected buildings as entities
      if (analysis.extracted.buildings) {
        for (const building of analysis.extracted.buildings) {
          await this.client.post('/api/entities', {
            domain: 'geospatial',
            entityType: 'building',
            textContent: `Building at [${building.centroid[0]}, ${building.centroid[1]}] with area ${building.area}m²`,
            metadata: {
              ...building,
              datasetId: analysis.datasetId,
              jobId: analysis.jobId,
              extractionMethod: 'lidar_dbscan',
            },
          });
        }

        logger.info('Stored buildings as entities', {
          count: analysis.extracted.buildings.length,
        });
      }

      // Store processing episode
      await this.client.post('/api/episodes', {
        content: `Processed LiDAR dataset with ${analysis.numPoints} points at ${analysis.location.lat},${analysis.location.lon}`,
        type: 'system_response',
        metadata: {
          jobId: analysis.jobId,
          datasetId: analysis.datasetId,
          operations: analysis.operations,
          processingTime: analysis.statistics.processingTimeMs,
        },
      });

      logger.info('LiDAR analysis stored in GraphRAG', {
        documentId,
        jobId: analysis.jobId,
      });

      return documentId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to store LiDAR analysis in GraphRAG', {
        jobId: analysis.jobId,
        error: errorMessage,
      });
      throw new Error(`Failed to store LiDAR analysis: ${errorMessage}`);
    }
  }

  /**
   * Store spectral analysis results in GraphRAG
   */
  async storeSpectralAnalysis(analysis: SpectralAnalysisResult): Promise<string> {
    try {
      logger.debug('Storing spectral analysis in GraphRAG', {
        jobId: analysis.jobId,
        analysisType: analysis.analysisType,
      });

      const report = this.generateSpectralMarkdownReport(analysis);

      const docResponse = await this.client.post('/api/documents', {
        content: report,
        title: `Hyperspectral Analysis - ${analysis.analysisType} - ${new Date().toISOString()}`,
        metadata: {
          type: 'spectral_analysis',
          datasetId: analysis.datasetId,
          jobId: analysis.jobId,
          location: analysis.location,
          analysisType: analysis.analysisType,
          numBands: analysis.numBands,
        },
      });

      const documentId = docResponse.data.documentId || docResponse.data.data?.memory_id;

      // Store identified materials as entities
      if (analysis.materials) {
        for (const material of analysis.materials) {
          await this.client.post('/api/entities', {
            domain: 'geospatial',
            entityType: 'material',
            textContent: `${material.material} detected with ${(material.confidence * 100).toFixed(1)}% confidence`,
            metadata: {
              ...material,
              datasetId: analysis.datasetId,
              jobId: analysis.jobId,
            },
          });
        }

        logger.info('Stored materials as entities', {
          count: analysis.materials.length,
        });
      }

      logger.info('Spectral analysis stored in GraphRAG', {
        documentId,
        jobId: analysis.jobId,
      });

      return documentId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to store spectral analysis in GraphRAG', {
        jobId: analysis.jobId,
        error: errorMessage,
      });
      throw new Error(`Failed to store spectral analysis: ${errorMessage}`);
    }
  }

  /**
   * Generate markdown report for LiDAR analysis
   */
  private generateLiDARMarkdownReport(analysis: LiDARAnalysisResult): string {
    const sections: string[] = [];

    sections.push(`# LiDAR Analysis Report`);
    sections.push(`\n**Dataset ID**: ${analysis.datasetId}`);
    sections.push(`**Location**: ${analysis.location.lat}, ${analysis.location.lon}`);
    sections.push(`**Date**: ${new Date().toISOString()}`);
    sections.push(`\n## Dataset Information`);
    sections.push(`- **Number of Points**: ${analysis.numPoints.toLocaleString()}`);
    sections.push(`- **Resolution**: ${analysis.resolution}m`);
    sections.push(`- **Bounds**:`);
    sections.push(`  - X: ${analysis.bounds.minX.toFixed(2)} to ${analysis.bounds.maxX.toFixed(2)}`);
    sections.push(`  - Y: ${analysis.bounds.minY.toFixed(2)} to ${analysis.bounds.maxY.toFixed(2)}`);
    sections.push(`  - Z: ${analysis.bounds.minZ.toFixed(2)} to ${analysis.bounds.maxZ.toFixed(2)}`);

    sections.push(`\n## Operations Performed`);
    analysis.operations.forEach(op => {
      sections.push(`- ${op}`);
    });

    if (analysis.extracted.buildings) {
      sections.push(`\n## Extracted Buildings`);
      sections.push(`**Total Buildings**: ${analysis.extracted.buildings.length}`);
      sections.push(`\n| ID | Centroid | Height (m) | Area (m²) | Points |`);
      sections.push(`|----|----------|-----------|----------|--------|`);
      analysis.extracted.buildings.slice(0, 10).forEach(building => {
        sections.push(
          `| ${building.id.substring(0, 8)} | [${building.centroid[0].toFixed(2)}, ${building.centroid[1].toFixed(2)}] | ${building.height.toFixed(2)} | ${building.area.toFixed(2)} | ${building.point_count} |`
        );
      });
      if (analysis.extracted.buildings.length > 10) {
        sections.push(`\n*...and ${analysis.extracted.buildings.length - 10} more buildings*`);
      }
    }

    if (analysis.extracted.vegetation) {
      sections.push(`\n## Vegetation Analysis`);
      sections.push(`- **Points Classified as Vegetation**: ${analysis.extracted.vegetation.point_count.toLocaleString()}`);
      sections.push(`- **Height Statistics**:`);
      sections.push(`  - Mean: ${analysis.extracted.vegetation.height_stats.mean.toFixed(2)}m`);
      sections.push(`  - Max: ${analysis.extracted.vegetation.height_stats.max.toFixed(2)}m`);
      sections.push(`  - Min: ${analysis.extracted.vegetation.height_stats.min.toFixed(2)}m`);
    }

    return sections.join('\n');
  }

  /**
   * Generate markdown report for spectral analysis
   */
  private generateSpectralMarkdownReport(analysis: SpectralAnalysisResult): string {
    const sections: string[] = [];

    sections.push(`# Hyperspectral Analysis Report`);
    sections.push(`\n**Dataset ID**: ${analysis.datasetId}`);
    sections.push(`**Analysis Type**: ${analysis.analysisType}`);
    sections.push(`**Date**: ${new Date().toISOString()}`);

    sections.push(`\n## Dataset Information`);
    sections.push(`- **Number of Bands**: ${analysis.numBands}`);
    if (analysis.wavelengths) {
      sections.push(`- **Wavelength Range**: ${Math.min(...analysis.wavelengths).toFixed(1)}nm - ${Math.max(...analysis.wavelengths).toFixed(1)}nm`);
    }

    if (analysis.unmixing) {
      sections.push(`\n## Spectral Unmixing Results`);
      sections.push(`- **Endmembers**: ${analysis.unmixing.endmembers.length}`);
      sections.push(`- **Reconstruction Error**: ${analysis.unmixing.error.toFixed(4)}`);
    }

    if (analysis.materials) {
      sections.push(`\n## Identified Materials`);
      sections.push(`\n| Material | Confidence | Coverage |`);
      sections.push(`|----------|------------|----------|`);
      analysis.materials.forEach(material => {
        sections.push(`| ${material.material} | ${(material.confidence * 100).toFixed(1)}% | ${material.pixels} pixels |`);
      });
    }

    if (analysis.indices) {
      sections.push(`\n## Vegetation Indices`);
      Object.entries(analysis.indices).forEach(([index, stats]: [string, any]) => {
        sections.push(`\n### ${index.toUpperCase()}`);
        sections.push(`- Mean: ${stats.mean.toFixed(3)}`);
        sections.push(`- Std Dev: ${stats.std.toFixed(3)}`);
        sections.push(`- Range: ${stats.min.toFixed(3)} to ${stats.max.toFixed(3)}`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Health check for GraphRAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.warn('GraphRAG health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
let storageInstance: HyperModalGraphRAGStorage | null = null;

/**
 * Get or create the singleton GraphRAG storage instance
 */
export function getHyperModalStorage(): HyperModalGraphRAGStorage {
  if (!storageInstance) {
    storageInstance = new HyperModalGraphRAGStorage();
  }
  return storageInstance;
}
