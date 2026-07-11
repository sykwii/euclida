import { Injectable } from '@nestjs/common';
import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';

@Injectable()
export class ExecutionSnapshotBuilder {
  buildExecutorSnapshot(
    body: CreateExecutionRecordDto,
  ): Record<string, unknown> {
    return this.cloneObject(body.executorSnapshot ?? {});
  }

  buildResourceSnapshot(
    body: CreateExecutionRecordDto,
  ): Record<string, unknown> {
    return this.cloneObject(body.resourceSnapshot ?? {});
  }

  private cloneObject(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
