import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import type { ReconSource, ReconTargetType } from '../src/modules/recon/recon.types';
import { ReconService } from '../src/modules/recon/services/recon.service';

async function main() {
  const csvPath = process.argv[2];
  const source = (process.argv[3] || 'light_recon') as ReconSource;
  const targetTypeOverride = (process.argv[4] || '') as ReconTargetType | '';

  if (!csvPath) {
    throw new Error('CSV path is required');
  }

  const fs = await import('node:fs/promises');
  const csv = await fs.readFile(csvPath, 'utf8');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const recon = app.get(ReconService);
    const result = await recon.previewImport({
      csv,
      filename: csvPath.split(/[\\/]/).pop(),
      source,
      duplicateStrategy: 'skip',
      targetTypeOverride: targetTypeOverride || undefined,
    });

    process.stdout.write(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

void main();
