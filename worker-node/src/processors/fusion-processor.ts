import { Job } from 'bullmq';
export async function processFusionJob(job: Job): Promise<any> {
  await job.updateProgress(50);
  await job.updateProgress(100);
  return { jobId: job.data.jobId, operation: job.data.operation, status: 'placeholder' };
}
