import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unit } from '../units/unit.entity';
import { AccessScopeService } from './access-scope.service';

@Module({
  imports: [TypeOrmModule.forFeature([Unit])],
  providers: [AccessScopeService],
  exports: [AccessScopeService],
})
export class AccessScopeModule {}