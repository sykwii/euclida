import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './unit.entity';
import { UnitsService } from './units.service';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsController {
  constructor(
    private readonly unitsService: UnitsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser): Promise<Unit[]> {
    return this.visibleUnits(user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Unit> {
    const visible = await this.visibleUnits(user);
    const unit = visible.find((item) => item.id === id);
    if (!unit) {
      throw new ForbiddenException('Підрозділ поза межами доступу');
    }
    return unit;
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateUnitDto): Promise<Unit> {
    return this.unitsService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.unitsService.remove(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id/with-related')
  removeWithRelated(@Param('id') id: string): Promise<void> {
    return this.unitsService.removeWithRelated(id);
  }
  @Get(':id/children')
  async findChildren(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Unit[]> {
    const visible = await this.visibleUnits(user);
    if (!visible.some((item) => item.id === id)) {
      throw new ForbiddenException('Підрозділ поза межами доступу');
    }
    return visible.filter((item) => item.parentId === id);
  }

  private async visibleUnits(user: AuthUser): Promise<Unit[]> {
    const units = await this.unitsService.findAll();
    const allowed = await this.accessScope.getAllowedUnitIds(user);
    if (allowed === null) {
      return units;
    }

    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const visibleIds = new Set(allowed);
    for (const id of allowed) {
      let parentId = byId.get(id)?.parentId;
      while (parentId) {
        visibleIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }

    return units.filter((unit) => visibleIds.has(unit.id));
  }
}
