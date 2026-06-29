import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shell } from './shell.entity';
import { ShellsController } from './shells.controller';
import { ShellsService } from './shells.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Shell])],
  controllers: [ShellsController],
  providers: [ShellsService],
})
export class ShellsModule {}