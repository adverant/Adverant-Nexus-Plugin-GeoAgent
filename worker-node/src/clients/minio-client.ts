/**
 * MinIO Client for Worker (simplified version of API client)
 */

import { Client } from 'minio';

export class MinIOClient {
  private client: Client;
  private bucket = 'geoagent-hypermodal';

  constructor() {
    this.client = new Client({
      endPoint: process.env.MINIO_HOST || 'nexus-minio',
      port: 9000,
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || 'unified_nexus',
      secretKey: process.env.MINIO_SECRET_KEY || 'nexus_minio_secure',
    });
  }

  async downloadFile(objectPath: string): Promise<Buffer> {
    const path = objectPath.replace(`minio://${this.bucket}/`, '');
    const stream = await this.client.getObject(this.bucket, path);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async uploadFile(objectPath: string, buffer: Buffer, options: any = {}): Promise<string> {
    await this.client.putObject(this.bucket, objectPath, buffer, buffer.length, options);
    return `minio://${this.bucket}/${objectPath}`;
  }
}

let instance: MinIOClient | null = null;
export function getMinIOClient(): MinIOClient {
  if (!instance) instance = new MinIOClient();
  return instance;
}
