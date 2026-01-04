/**
 * GraphRAG Client for Worker (copy of API GraphRAG storage logic)
 */

import axios, { AxiosInstance } from 'axios';

export class GraphRAGClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.GRAPHRAG_URL || 'http://nexus-graphrag:8090',
      timeout: 30000,
    });
  }

  async storeLiDARAnalysis(analysis: any): Promise<string> {
    const report = this.generateLiDARReport(analysis);

    const response = await this.client.post('/api/documents', {
      content: report,
      title: `LiDAR Analysis - ${analysis.jobId}`,
      metadata: { type: 'lidar_analysis', ...analysis.metadata },
    });

    return response.data.documentId || response.data.data?.memory_id;
  }

  async storeSpectralAnalysis(analysis: any): Promise<string> {
    const report = this.generateSpectralReport(analysis);

    const response = await this.client.post('/api/documents', {
      content: report,
      title: `Spectral Analysis - ${analysis.jobId}`,
      metadata: { type: 'spectral_analysis', jobId: analysis.jobId, analysisType: analysis.type },
    });

    return response.data.documentId || response.data.data?.memory_id;
  }

  async storeSARAnalysis(analysis: any): Promise<string> {
    const report = this.generateSARReport(analysis);

    const response = await this.client.post('/api/documents', {
      content: report,
      title: `SAR Analysis - ${analysis.jobId}`,
      metadata: { type: 'sar_analysis', jobId: analysis.jobId, operation: analysis.operation },
    });

    return response.data.documentId || response.data.data?.memory_id;
  }

  async storeThermalAnalysis(analysis: any): Promise<string> {
    const report = this.generateThermalReport(analysis);

    const response = await this.client.post('/api/documents', {
      content: report,
      title: `Thermal Analysis - ${analysis.jobId}`,
      metadata: { type: 'thermal_analysis', jobId: analysis.jobId, operation: analysis.operation },
    });

    return response.data.documentId || response.data.data?.memory_id;
  }

  async storeFusionAnalysis(analysis: any): Promise<string> {
    const report = this.generateFusionReport(analysis);

    const response = await this.client.post('/api/documents', {
      content: report,
      title: `Fusion Analysis - ${analysis.jobId}`,
      metadata: { type: 'fusion_analysis', jobId: analysis.jobId, fusionLevel: analysis.fusionLevel },
    });

    return response.data.documentId || response.data.data?.memory_id;
  }

  private generateLiDARReport(analysis: any): string {
    return `# LiDAR Analysis

**Job ID:** ${analysis.jobId}
**Operations:** ${analysis.operations?.join(', ') || 'N/A'}
**Processing Time:** ${analysis.statistics?.processingTimeMs || 0}ms

## Results
${JSON.stringify(analysis.results || {}, null, 2)}
`;
  }

  private generateSpectralReport(analysis: any): string {
    return `# Spectral Analysis

**Job ID:** ${analysis.jobId}
**Type:** ${analysis.type}
**Timestamp:** ${analysis.timestamp}

## Results
${JSON.stringify(analysis.results || {}, null, 2)}
`;
  }

  private generateSARReport(analysis: any): string {
    return `# SAR Analysis

**Job ID:** ${analysis.jobId}
**Operation:** ${analysis.operation}
**Timestamp:** ${analysis.timestamp}

## Results
${JSON.stringify(analysis.results || {}, null, 2)}
`;
  }

  private generateThermalReport(analysis: any): string {
    return `# Thermal Analysis

**Job ID:** ${analysis.jobId}
**Operation:** ${analysis.operation}
**Timestamp:** ${analysis.timestamp}

## Results
${JSON.stringify(analysis.results || {}, null, 2)}
`;
  }

  private generateFusionReport(analysis: any): string {
    return `# Multi-Modal Fusion Analysis

**Job ID:** ${analysis.jobId}
**Fusion Level:** ${analysis.fusionLevel}
**Input Modalities:** ${analysis.inputModalities?.join(', ') || 'N/A'}
**Timestamp:** ${analysis.timestamp}

## Results
${JSON.stringify(analysis.results || {}, null, 2)}
`;
  }
}

let instance: GraphRAGClient | null = null;
export function getGraphRAGClient(): GraphRAGClient {
  if (!instance) instance = new GraphRAGClient();
  return instance;
}
