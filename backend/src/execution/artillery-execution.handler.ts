import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionHandler } from './execution-handler.interface';
import type { ExecutionPipelineArtillerySnapshot } from './execution-pipeline-context.type';
import type { ExecutionType } from './execution-record.entity';

@Injectable()
export class ArtilleryExecutionHandler implements ExecutionHandler {
  private readonly supportedTypes: ReadonlySet<ExecutionType> = new Set([
    'artillery',
    'mortar',
    'mlrs',
    'fpv',
    'bomber',
    'other',
  ]);

  supports(type: ExecutionType): boolean {
    return this.supportedTypes.has(type);
  }

  validate(body: CreateExecutionRecordDto): void {
    const startedAt = new Date(body.startedAt);
    const completedAt = body.completedAt ? new Date(body.completedAt) : null;

    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('Некоректний час початку');
    }

    if (completedAt && completedAt < startedAt) {
      throw new BadRequestException(
        'Час завершення не може бути раніше часу початку',
      );
    }

    if (body.executionType === 'artillery' && !body.artillery) {
      throw new BadRequestException(
        'Для артилерійського запису обов’язкова компоновка пострілу',
      );
    }

    if (body.executionType !== 'artillery' && body.artillery) {
      throw new BadRequestException(
        'Артилерійська компоновка допустима тільки для типу artillery',
      );
    }

    if (!body.artillery) {
      return;
    }

    const ids = body.artillery.charges.map((item) => item.chargeId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Один заряд не можна додавати до компоновки двічі',
      );
    }
  }

  buildArtillerySnapshot(
    body: CreateExecutionRecordDto,
  ): ExecutionPipelineArtillerySnapshot | null {
    if (!body.artillery) {
      return null;
    }

    return {
      compositionSource: body.artillery.compositionSource,
      sourceShotConfigurationId:
        body.artillery.sourceShotConfigurationId ?? null,
      weaponModelId: body.artillery.weaponModelId,
      shellId: body.artillery.shellId,
      fuzeId: body.artillery.fuzeId,
      primerId: body.artillery.primerId,
      zoneId: body.artillery.zoneId,
      maxRangeM: body.artillery.maxRangeM,
      compositionSnapshot: this.cloneObject(body.artillery.compositionSnapshot),
      charges: body.artillery.charges.map((component) => ({
        chargeId: component.chargeId,
        chargeNameSnapshot: component.chargeName,
        quantityPerShot: component.quantityPerShot,
        accountingUnit: component.accountingUnit,
        sortOrder: component.sortOrder,
      })),
    };
  }

  private cloneObject(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
