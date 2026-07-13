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
      throw new NotFoundException('РљРѕРјРїР»РµРєС‚ РїРѕСЃС‚СЂС–Р»Сѓ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
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
      zoneNumber: data.zoneNumber ?? null,
      zoneId: null,
      maxRangeM: data.maxRangeM,
      isActive: data.isActive ?? false,
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
      zoneNumber:
        data.zoneNumber === undefined ? item.zoneNumber : data.zoneNumber,
      maxRangeM: data.maxRangeM ?? item.maxRangeM,
      isActive: data.isActive ?? item.isActive,
      note: data.note === undefined ? item.note : data.note,
      charges:
        data.charges ??
        item.charges.map((charge) => ({
          chargeId: charge.chargeId,
          quantityPerShot: charge.quantityPerShot,
          accountingUnit: charge.accountingUnit,
          sortOrder: charge.sortOrder,
        })),
    };

    await this.validateInput(payload, id);

    item.name = payload.name.trim();
    item.weaponModelId = payload.weaponModelId;
    item.shellId = payload.shellId;
    item.fuzeId = payload.fuzeId ?? null;
    item.primerId = payload.primerId ?? null;
    item.zoneNumber = payload.zoneNumber ?? null;
    item.zoneId = null;
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

    if (isActive) {
      await this.validateInput(
        {
          name: item.name,
          weaponModelId: item.weaponModelId,
          shellId: item.shellId,
          fuzeId: item.fuzeId,
          primerId: item.primerId,
          zoneNumber: item.zoneNumber,
          maxRangeM: item.maxRangeM,
          isActive,
          note: item.note,
          charges: item.charges.map((charge) => ({
            chargeId: charge.chargeId,
            quantityPerShot: charge.quantityPerShot,
            accountingUnit: charge.accountingUnit,
            sortOrder: charge.sortOrder,
          })),
        },
        item.id,
      );
    }

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
      throw new BadRequestException('Р’РєР°Р¶С–С‚СЊ РЅР°Р·РІСѓ РєРѕРјРїР»РµРєС‚Сѓ РїРѕСЃС‚СЂС–Р»Сѓ');
    }

    const duplicate = await this.repository.findOne({
      where: {
        weaponModelId: data.weaponModelId,
        name,
      },
    });

    if (duplicate && duplicate.id !== currentId) {
      throw new BadRequestException(
        'Р”Р»СЏ С†С–С”С— РјРѕРґРµР»С– РѕР·Р±СЂРѕС”РЅРЅСЏ РІР¶Рµ С–СЃРЅСѓС” РєРѕРјРїР»РµРєС‚ РїРѕСЃС‚СЂС–Р»Сѓ Р· С‚Р°РєРѕСЋ РЅР°Р·РІРѕСЋ',
      );
    }

    const weaponModel = await this.weaponModelRepository.findOne({
      where: { id: data.weaponModelId },
    });

    if (!weaponModel) {
      throw new BadRequestException('РњРѕРґРµР»СЊ РѕР·Р±СЂРѕС”РЅРЅСЏ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
    }

    const shell = await this.shellRepository.findOne({
      where: { id: data.shellId },
    });
    if (!shell) {
      throw new BadRequestException('РЎРЅР°СЂСЏРґ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
    }

    if (data.fuzeId) {
      const fuze = await this.fuzeRepository.findOne({
        where: { id: data.fuzeId },
      });
      if (!fuze) {
        throw new BadRequestException('РџС–РґСЂРёРІРЅРёРє РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
      }
    }

    if (data.primerId) {
      const primer = await this.primerRepository.findOne({
        where: { id: data.primerId },
      });
      if (!primer) {
        throw new BadRequestException('РљР°РїСЃСѓР»СЊ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
      }
    }

    const chargeIds = data.charges.map((item) => item.chargeId);
    if (new Set(chargeIds).size !== chargeIds.length) {
      throw new BadRequestException(
        'РЈ РєРѕРјРїР»РµРєС‚С– РїРѕСЃС‚СЂС–Р»Сѓ РЅРµ РјРѕР¶РЅР° РґСѓР±Р»СЋРІР°С‚Рё РѕРґРёРЅ С– С‚РѕР№ СЃР°РјРёР№ Р·Р°СЂСЏРґ',
      );
    }

    const charges = await this.chargesRepository.find({
      where: { id: In(chargeIds) },
    });

    if (charges.length !== chargeIds.length) {
      throw new BadRequestException(
        'РћРґРёРЅ Р°Р±Рѕ РєС–Р»СЊРєР° Р·Р°СЂСЏРґС–РІ РЅРµ Р·РЅР°Р№РґРµРЅРѕ',
      );
    }

    const chargesById = new Map(charges.map((item) => [item.id, item]));
    for (const component of data.charges) {
      const charge = chargesById.get(component.chargeId);
      if (!charge) {
        continue;
      }

      const expectedAccountingUnit =
        charge.chargeKind === 'modular' ? 'module' : 'piece';
      if (component.accountingUnit !== expectedAccountingUnit) {
        throw new BadRequestException(
          'РћРґРёРЅ Р°Р±Рѕ РєС–Р»СЊРєР° РєРѕРјРїРѕРЅРµРЅС‚С–РІ РјР°СЋС‚СЊ РЅРµРєРѕСЂРµРєС‚РЅСѓ РѕРґРёРЅРёС†СЋ РѕР±Р»С–РєСѓ',
        );
      }
    }

    if (data.isActive) {
      if (!data.fuzeId) {
        throw new BadRequestException(
          'Р”Р»СЏ Р°РєС‚РёРІРЅРѕРіРѕ РєРѕРјРїР»РµРєС‚Сѓ РїРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё РїС–РґСЂРёРІРЅРёРє',
        );
      }

      if (!data.primerId) {
        throw new BadRequestException(
          'Р”Р»СЏ Р°РєС‚РёРІРЅРѕРіРѕ РєРѕРјРїР»РµРєС‚Сѓ РїРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё РїСЂР°Р№РјРµСЂ',
        );
      }

      if (
        !data.zoneNumber ||
        !Number.isInteger(data.zoneNumber) ||
        data.zoneNumber <= 0
      ) {
        throw new BadRequestException(
          'Р”Р»СЏ Р°РєС‚РёРІРЅРѕРіРѕ РєРѕРјРїР»РµРєС‚Сѓ РїРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё РЅРѕРјРµСЂ Р·РѕРЅРё',
        );
      }
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
        accountingUnit: charge.accountingUnit,
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
