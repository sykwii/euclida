import { ValidationPipe } from '@nestjs/common';
import { HeatmapQueryDto } from './recon.dto';

describe('HeatmapQueryDto', () => {
  it('accepts the frontend cache-buster with strict query validation', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { type: 'observation', period: '24h', _ts: '1785411056067' },
        { type: 'query', metatype: HeatmapQueryDto },
      ),
    ).resolves.toMatchObject({
      type: 'observation',
      period: '24h',
      _ts: '1785411056067',
    });
  });
});
