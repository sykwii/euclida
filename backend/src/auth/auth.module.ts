import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AdminOnlyGuard } from './admin-only.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { HttpWriteGuard } from './http-write.guard';
import { MainScopeGuard } from './main-scope.guard';
import { WriteAccessGuard } from './write-access.guard';
import { buildJwtModuleOptions } from './jwt-config';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: buildJwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    HttpWriteGuard,
    WriteAccessGuard,
    AdminOnlyGuard,
    MainScopeGuard,
    LoginRateLimitGuard,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    HttpWriteGuard,
    WriteAccessGuard,
    AdminOnlyGuard,
    MainScopeGuard,
  ],
})
export class AuthModule {}
