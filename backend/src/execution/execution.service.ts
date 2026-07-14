import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionValidationResult } from './execution-engine.service';
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

  updateDraft(
    recordId: string,
    body: CreateExecutionRecordDto,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    return this.executionEngine.updateDraft(recordId, body, user);
  }

  cancelDraft(recordId: string, user: AuthUser): Promise<ExecutionRecord> {
    return this.executionEngine.cancelDraft(recordId, user);
  }

  validateRecord(
    recordId: string,
    user: AuthUser,
  ): Promise<ExecutionValidationResult> {
    return this.executionEngine.validateRecord(recordId, user);
  }
}
