import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShellCompatibleCharge } from './shell-compatible-charge.entity';
import { ShellCompatibleChargesController } from './shell-compatible-charges.controller';
import { ShellCompatibleChargesService } from './shell-compatible-charges.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([ShellCompatibleCharge])],
  controllers: [ShellCompatibleChargesController],
  providers: [ShellCompatibleChargesService],
})
export class ShellCompatibleChargesModule {}