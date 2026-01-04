/**
 * ML Service Client for Worker
 */

import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs';

export class MLServiceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.ML_SERVICE_URL || 'http://geoagent-ml:5001',
      timeout: 60000,
    });
  }

  async classifyLiDAR(params: { filePath: string; operations: string[] }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));

    const response = await this.client.post('/lidar/classify', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      numPoints: 0,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      buildings: [],
      vegetation: { point_count: 0, height_stats: { mean: 0, max: 0, min: 0 } },
    };
  }

  async identifyMaterials(params: { filePath: string; library: string }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('library', params.library);

    const response = await this.client.post('/spectral/identify', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || { materials: [] };
  }

  async detectAnomalies(params: { filePath: string; threshold: number }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('threshold', params.threshold.toString());

    const response = await this.client.post('/thermal/detect_anomalies', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || { anomalies: [] };
  }

  // ============================================================================
  // Spectral Processing Methods
  // ============================================================================

  async spectralUnmix(params: {
    filePath: string;
    algorithm: string;
    endmembers?: string[];
    bands?: number[];
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('algorithm', params.algorithm);
    if (params.endmembers) {
      form.append('endmembers', JSON.stringify(params.endmembers));
    }
    if (params.bands) {
      form.append('bands', JSON.stringify(params.bands));
    }

    const response = await this.client.post('/spectral/unmix', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      abundances: [],
      residual: 0,
      numEndmembers: 0,
      pixelsProcessed: 0,
    };
  }

  async calculateVegetationIndices(params: {
    filePath: string;
    indices: string[];
    threshold?: number;
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('indices', JSON.stringify(params.indices));
    if (params.threshold !== undefined) {
      form.append('threshold', params.threshold.toString());
    }

    const response = await this.client.post('/spectral/vegetation', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      indices: {},
      healthScore: 0,
      coveragePercent: 0,
      stressAreas: [],
      pixelsProcessed: 0,
    };
  }

  async mapMinerals(params: {
    filePath: string;
    library: string;
    threshold?: number;
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('library', params.library);
    if (params.threshold !== undefined) {
      form.append('threshold', params.threshold.toString());
    }

    const response = await this.client.post('/spectral/minerals', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      minerals: [],
      alterationZones: [],
      bandsUsed: 0,
      pixelsProcessed: 0,
    };
  }

  async analyzeWaterQuality(params: {
    filePath: string;
    indices: string[];
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    form.append('indices', JSON.stringify(params.indices));

    const response = await this.client.post('/spectral/water_quality', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      parameters: {},
      overallQuality: 'unknown',
      alerts: [],
      bandsUsed: 0,
      pixelsProcessed: 0,
    };
  }

  // ============================================================================
  // SAR Processing Methods
  // ============================================================================

  async processInterferometry(params: {
    filePaths: string[];
    multilook?: { range: number; azimuth: number };
    filtering?: string;
  }): Promise<any> {
    const form = new FormData();
    params.filePaths.forEach((fp, i) => {
      form.append(`file${i}`, fs.createReadStream(fp));
    });
    if (params.multilook) {
      form.append('multilook', JSON.stringify(params.multilook));
    }
    if (params.filtering) {
      form.append('filtering', params.filtering);
    }

    const response = await this.client.post('/sar/interferometry', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      phase: null,
      coherence: null,
      deformation: null,
    };
  }

  async calculateCoherence(params: {
    filePaths: string[];
    windowSize?: number;
  }): Promise<any> {
    const form = new FormData();
    params.filePaths.forEach((fp, i) => {
      form.append(`file${i}`, fs.createReadStream(fp));
    });
    if (params.windowSize) {
      form.append('window_size', params.windowSize.toString());
    }

    const response = await this.client.post('/sar/coherence', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      coherenceMap: null,
      statistics: { mean: 0, std: 0 },
    };
  }

  async detectSARChanges(params: {
    filePaths: string[];
    threshold?: number;
    method?: string;
  }): Promise<any> {
    const form = new FormData();
    params.filePaths.forEach((fp, i) => {
      form.append(`file${i}`, fs.createReadStream(fp));
    });
    if (params.threshold) {
      form.append('threshold', params.threshold.toString());
    }
    if (params.method) {
      form.append('method', params.method);
    }

    const response = await this.client.post('/sar/change_detection', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      changes: [],
      changeMap: null,
      statistics: {},
    };
  }

  // ============================================================================
  // Thermal Processing Methods
  // ============================================================================

  async generateHeatmap(params: {
    filePath: string;
    colorMap?: string;
    temperatureUnit?: string;
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    if (params.colorMap) {
      form.append('color_map', params.colorMap);
    }
    if (params.temperatureUnit) {
      form.append('temperature_unit', params.temperatureUnit);
    }

    const response = await this.client.post('/thermal/heatmap', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      heatmapImage: null,
      statistics: {},
    };
  }

  async extractTemperatures(params: {
    filePath: string;
    calibration?: Record<string, any>;
    regions?: Array<{ x: number; y: number; radius: number }>;
  }): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(params.filePath));
    if (params.calibration) {
      form.append('calibration', JSON.stringify(params.calibration));
    }
    if (params.regions) {
      form.append('regions', JSON.stringify(params.regions));
    }

    const response = await this.client.post('/thermal/extract', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      temperatures: [],
      statistics: {},
    };
  }

  // ============================================================================
  // Fusion Processing Methods
  // ============================================================================

  async fuseData(params: {
    inputs: Record<string, string>; // type -> filePath
    fusionLevel: 'pixel' | 'feature' | 'decision';
    outputFormat?: string;
  }): Promise<any> {
    const form = new FormData();
    Object.entries(params.inputs).forEach(([type, filePath]) => {
      form.append(type, fs.createReadStream(filePath));
    });
    form.append('fusion_level', params.fusionLevel);
    if (params.outputFormat) {
      form.append('output_format', params.outputFormat);
    }

    const response = await this.client.post('/fusion/fuse', form, {
      headers: form.getHeaders(),
    });

    return response.data.result || {
      fusedData: null,
      metadata: {},
    };
  }
}

let instance: MLServiceClient | null = null;
export function getMLServiceClient(): MLServiceClient {
  if (!instance) instance = new MLServiceClient();
  return instance;
}
