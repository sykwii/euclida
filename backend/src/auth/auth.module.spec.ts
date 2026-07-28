import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  it('exports authentication guards and JwtService globally', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, AuthModule)).toBe(true);
  });
});
