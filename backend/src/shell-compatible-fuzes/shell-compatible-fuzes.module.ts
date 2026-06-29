import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShellCompatibleFuze } from './shell-compatible-fuze.entity';
import { ShellCompatibleFuzesController } from './shell-compatible-fuzes.controller';
import { ShellCompatibleFuzesService } from './shell-compatible-fuzes.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([ShellCompatibleFuze])],
  controllers: [ShellCompatibleFuzesController],
  providers: [ShellCompatibleFuzesService],
})
export class ShellCompatibleFuzesModule {}