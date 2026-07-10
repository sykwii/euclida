import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { Shell } from '../shells/shell.entity';
import { WeaponModel } from '../weapon-models/weapon-model.entity';
import { Zone } from '../zones/zone.entity';
import { CreateShotConfigurationDto } from './dto/create-shot-configuration.dto';
import { UpdateShotConfigurationDto } from './dto/update-shot-configuration.dto';
import { ShotConfigurationCharge } from './shot-configuration-charge.entity';
import { ShotConfiguration } from './shot-configuration.entity';

@Injectable()
export class ShotConfigurationsService {
  constructor(
    @InjectRepository(ShotConfiguration)
    private readonly repository: Repository<ShotConfiguration>,
    @InjectRepository(ShotConfigurationCharge)
    private readonly chargeRepository: Repository<ShotConfigurationCharge>,
    @InjectRepository(WeaponModel)
    private readonly weaponModelRepository: Repository<WeaponModel>,
    @InjectRepository(Shell)
    private readonly shellRepository: Repository<Shell>,
    @InjectRepository(Fuze)
    private readonly fuzeRepository: Repository<Fuze>,
    @InjectRepository(Primer)
    private readonly primerRepository: Repository<Primer>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(Charge)
    private readonly chargesRepository: Repository<Charge>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<ShotConfiguration[]> {
    return this.repository.find({
      relations: {
        weaponModel: true,
        shell: true,
        fuze: true,
        primer: true,
        zone: true,
        charges: {
          charge: true,
        },
      },
      order: {
        weaponModel: {
          name: 'ASC',
        },
        name: 'ASC',
        charges: {
          sortOrder: 'ASC',
        },
      },
    });
  }

  async findOne(id: string): Promise<ShotConfiguration> {
    const item = await this.repository.findOne({
      where: { id },
      relations: {
        weaponModel: true,
        shell: true,
        fuze: true,
        primer: true,
        zone: true,
        charges: {
          charge: true,
        },
      },
      order: {
        charges: {
          sortOrder: 'ASC',
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Комплект пострілу не знайдено');
    }

    return item;
  }

  async create(data: CreateShotConfigurationDto): Promise<ShotConfiguration> {
    await this.validateInput(data);
    const item = this.repository.create({
      name: data.name.trim(),
      weaponModelId: data.weaponModelId,
      shellId: data.shellId,
      fuzeId: data.fuzeId ?? null,
      primerId: data.primerId ?? null,
      zoneId: data.zoneId ?? null,
      maxRangeM: data.maxRangeM,
      isActive: data.isActive ?? true,
      note: data.note?.trim() || null,
    });
    const saved = await this.repository.save(item);
    await this.replaceCharges(saved.id, data.charges);
    this.emitChanged('created', saved.id);
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    data: UpdateShotConfigurationDto,
  ): Promise<ShotConfiguration> {
    const item = await this.findOne(id);
    const payload: CreateShotConfigurationDto = {
      name: data.name ?? item.name,
      weaponModelId: data.weaponModelId ?? item.weaponModelId,
      shellId: data.shellId ?? item.shellId,
      fuzeId: data.fuzeId === undefined ? item.fuzeId : data.fuzeId,
      primerId: data.primerId === undefined ? item.primerId : data.primerId,
      zoneId: data.zoneId === undefined ? item.zoneId : data.zoneId,
      maxRangeM: data.maxRangeM ?? item.maxRangeM,
      isActive: data.isActive ?? item.isActive,
      note: data.note === undefined ? item.note : data.note,
      charges:
        data.charges ??
        item.charges.map((charge) => ({
          chargeId: charge.chargeId,
          quantityPerShot: charge.quantityPerShot,
          sortOrder: charge.sortOrder,
        })),
    };

    await this.validateInput(payload, id);

    item.name = payload.name.trim();
    item.weaponModelId = payload.weaponModelId;
    item.shellId = payload.shellId;
    item.fuzeId = payload.fuzeId ?? null;
    item.primerId = payload.primerId ?? null;
    item.zoneId = payload.zoneId ?? null;
    item.maxRangeM = payload.maxRangeM;
    item.isActive = payload.isActive ?? item.isActive;
    item.note = payload.note?.trim() || null;

    await this.repository.save(item);
    await this.replaceCharges(item.id, payload.charges);
    this.emitChanged('updated', item.id);
    return this.findOne(item.id);
  }

  async activate(id: string, isActive: boolean): Promise<ShotConfiguration> {
    const item = await this.findOne(id);
    item.isActive = isActive;
    await this.repository.save(item);
    this.emitChanged('updated', item.id);
    return this.findOne(item.id);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
    this.emitChanged('deleted', id);
  }

  private async validateInput(
    data: CreateShotConfigurationDto,
    currentId?: string,
  ): Promise<void> {
    const name = data.name.trim();

    if (!name) {
      throw new BadRequestException('Вкажіть назву комплекту пострілу');
    }

    const duplicate = await this.repository.findOne({
      where: {
        weaponModelId: data.weaponModelId,
        name,
      },
    });

    if (duplicate && duplicate.id !== currentId) {
      throw new BadRequestException(
        'Для цієї моделі озброєння вже існує комплект пострілу з такою назвою',
      );
    }

    const weaponModel = await this.weaponModelRepository.findOne({
      where: { id: data.weaponModelId },
    });

    if (!weaponModel) {
      throw new BadRequestException('Модель озброєння не знайдено');
    }

    const shell = await this.shellRepository.findOne({ where: { id: data.shellId } });
    if (!shell) {
      throw new BadRequestException('Снаряд не знайдено');
    }

    if (data.fuzeId) {
      const fuze = await this.fuzeRepository.findOne({ where: { id: data.fuzeId } });
      if (!fuze) {
        throw new BadRequestException('Підривник не знайдено');
      }
    }

    if (data.primerId) {
      const primer = await this.primerRepository.findOne({ where: { id: data.primerId } });
      if (!primer) {
        throw new BadRequestException('Капсуль не знайдено');
      }
    }

    if (data.zoneId) {
      const zone = await this.zoneRepository.findOne({ where: { id: data.zoneId } });
      if (!zone) {
        throw new BadRequestException('Зону не знайдено');
      }

      if (zone.weaponModelId !== data.weaponModelId) {
        throw new BadRequestException(
          'Зона повинна належати тій самій моделі озброєння, що і комплект пострілу',
        );
      }
    }

    const chargeIds = data.charges.map((item) => item.chargeId);
    if (new Set(chargeIds).size !== chargeIds.length) {
      throw new BadRequestException('У комплекті пострілу не можна дублювати один і той самий заряд');
    }

    const charges = await this.chargesRepository.find({
      where: { id: In(chargeIds) },
    });

    if (charges.length !== chargeIds.length) {
      throw new BadRequestException('Один або кілька зарядів не знайдено');
    }
  }

  private async replaceCharges(
    shotConfigurationId: string,
    charges: CreateShotConfigurationDto['charges'],
  ): Promise<void> {
    await this.chargeRepository.delete({ shotConfigurationId });
    const rows = charges.map((charge, index) =>
      this.chargeRepository.create({
        shotConfigurationId,
        chargeId: charge.chargeId,
        quantityPerShot: charge.quantityPerShot,
        sortOrder: charge.sortOrder ?? index,
      }),
    );
    await this.chargeRepository.save(rows);
  }

  private emitChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'stock', 'analytics', 'events'], action, {
      entity: 'shot_configuration',
      id,
    });
  }
}
