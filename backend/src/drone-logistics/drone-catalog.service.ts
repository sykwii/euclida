import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateDroneModelDto,
  CreateDroneWarheadTypeDto,
} from './dto/drone-logistics.dto';
import { DroneLogisticsSchemaService } from './drone-logistics-schema.service';
import { DroneModel } from './drone-model.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';

@Injectable()
export class DroneCatalogService {
  constructor(
    @InjectRepository(DroneModel)
    private readonly droneModels: Repository<DroneModel>,
    @InjectRepository(DroneWarheadType)
    private readonly warheadTypes: Repository<DroneWarheadType>,
    private readonly schema: DroneLogisticsSchemaService,
  ) {}

  async getDroneModels(): Promise<DroneModel[]> {
    await this.schema.ensureDroneLogisticsSchema();
    return this.droneModels.find({ order: { name: 'ASC' } });
  }

  async createDroneModel(data: CreateDroneModelDto): Promise<DroneModel> {
    await this.schema.ensureDroneLogisticsSchema();

    const model = this.droneModels.create({
      name: data.name.trim(),
      droneGroup: data.droneGroup,
      droneType: data.droneType,
      cameraType: data.cameraType ?? 'none',
      maxRangeM: data.maxRangeM ?? null,
      cruiseSpeedKmh: data.cruiseSpeedKmh ?? null,
      enduranceMinutes: data.enduranceMinutes ?? null,
      payloadCapacityKg: data.payloadCapacityKg ?? null,
      maxAltitudeM: data.maxAltitudeM ?? null,
      maxWindMs: data.maxWindMs ?? null,
      note: data.note?.trim() || null,
    });

    return this.droneModels.save(model);
  }

  async getWarheadTypes(): Promise<DroneWarheadType[]> {
    await this.schema.ensureDroneLogisticsSchema();
    return this.warheadTypes.find({ order: { name: 'ASC' } });
  }

  async createWarheadType(
    data: CreateDroneWarheadTypeDto,
  ): Promise<DroneWarheadType> {
    await this.schema.ensureDroneLogisticsSchema();

    return this.warheadTypes.save(
      this.warheadTypes.create({
        name: data.name.trim(),
        weightKg: data.weightKg ?? null,
        measureUnit: data.measureUnit ?? 'unit',
        note: data.note?.trim() || null,
      }),
    );
  }
}
