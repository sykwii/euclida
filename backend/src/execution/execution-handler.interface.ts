import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionPipelineArtillerySnapshot } from './execution-pipeline-context.type';
import type { ExecutionType } from './execution-record.entity';

export interface ExecutionHandler {
  supports(type: ExecutionType): boolean;
  validate(body: CreateExecutionRecordDto): void;
  buildArtillerySnapshot(
    body: CreateExecutionRecordDto,
  ): ExecutionPipelineArtillerySnapshot | null;
}
