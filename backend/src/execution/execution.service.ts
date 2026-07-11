import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import { ExecutionEngineService } from './execution-engine.service';
import { ExecutionRecord } from './execution-record.entity';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly executionEngine: ExecutionEngineService,
  ) {}

  findByServiceOrder(
    serviceOrderId: string,
    user: AuthUser,
  ): Promise<ExecutionRecord[]> {
    return this.executionEngine.findByServiceOrder(serviceOrderId, user);
  }

  create(
    serviceOrderId: string,
    body: CreateExecutionRecordDto,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    return this.executionEngine.create(serviceOrderId, body, user);
  }

  post(
    recordId: string,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    return this.executionEngine.post(recordId, user);
  }
}
