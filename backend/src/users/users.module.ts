import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unit } from '../units/unit.entity';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { buildJwtModuleOptions } from '../auth/jwt-config';

@Module({
  imports: [
    RealtimeModule,
    TypeOrmModule.forFeature([User, Unit]),
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: buildJwtModuleOptions,
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtAuthGuard, AdminOnlyGuard],
  exports: [UsersService],
})
export class UsersModule {}
