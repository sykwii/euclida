import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateWeaponSystemDto } from './dto/create-weapon-system.dto';
import { UpdateWeaponSystemDto } from './dto/update-weapon-system.dto';
import { AssignWeaponToFirePositionDto } from './dto/assign-weapon-to-fire-position.dto';
import { CompleteWeaponMaintenanceDto } from './dto/complete-weapon-maintenance.dto';
import { ConfirmWeaponReadinessDto } from './dto/confirm-weapon-readiness.dto';
import { CreateWeaponDeploymentDto } from './dto/create-weapon-deployment.dto';
import { ExtendMaintenanceDto } from './dto/extend-maintenance.dto';
import { OpenWeaponMaintenanceDto } from './dto/open-weapon-maintenance.dto';
import { RequestMaintenanceDto } from './dto/request-maintenance.dto';
import { UpdateWeaponDeploymentDto } from './dto/update-weapon-deployment.dto';
import { WeaponSystem } from './weapon-system.entity';
import { WeaponSystemsService } from './weapon-systems.service';

@UseGuards(JwtAuthGuard)
@Controller('weapon-systems')
export class WeaponSystemsController {
  constructor(private readonly service: WeaponSystemsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<WeaponSystem[]> {
    return this.service.findAll(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<WeaponSystem> {
    return this.service.findOne(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWeaponSystemDto,
  ): Promise<WeaponSystem> {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWeaponSystemDto,
  ): Promise<WeaponSystem> {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, user);
  }


  @UseGuards(WriteAccessGuard)
  /** @deprecated Active UI uses the canonical planned deployment flow. */
  @Post(':id/assign-to-fire-position')
  assignToFirePosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignWeaponToFirePositionDto,
  ): Promise<WeaponSystem> {
  return this.service.assignToFirePosition(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/assign')
  planMoveToFirePosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.planMoveToFirePosition(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/start-to-fire-position')
  startMoveToFirePosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.startMoveToFirePosition(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/confirm-fire-position-arrival')
  confirmFirePositionArrival(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.confirmFirePositionArrival(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/withdraw')
  planMoveToReserve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.planMoveToReserve(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/start-to-reserve')
  startMoveToReserve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.startMoveToReserve(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/confirm-reserve-arrival')
  confirmReserveArrival(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWeaponDeploymentDto,
  ): Promise<WeaponSystem> {
    return this.service.confirmReserveArrival(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/deployment/cancel')
  cancelDeployment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<WeaponSystem> {
    return this.service.cancelDeployment(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('sync-fire-position-states')
  syncFirePositionStates(
    @CurrentUser() user: AuthUser,
  ): Promise<{ updated: number }> {
    return this.service.syncAllFirePositionStates(user);
  }

@UseGuards(WriteAccessGuard)
@Post(':id/move-to-reserve')
moveToReserve(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.moveToReserve(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/request')
requestMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body() body: RequestMaintenanceDto,
): Promise<WeaponSystem> {
  return this.service.requestMaintenance(id, body, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/open')
openMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body() body: OpenWeaponMaintenanceDto,
): Promise<WeaponSystem> {
  return this.service.openMaintenance(id, body, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/approve')
approveMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.approveMaintenance(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/start')
startMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.startMaintenance(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/reject')
rejectMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.rejectMaintenance(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/cancel')
cancelMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.cancelMaintenance(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/extend')
extendMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body() body: ExtendMaintenanceDto,
): Promise<WeaponSystem> {
  return this.service.extendMaintenance(id, body, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/finish')
finishMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.finishMaintenance(id, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/maintenance/complete')
completeMaintenance(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body() body: CompleteWeaponMaintenanceDto,
): Promise<WeaponSystem> {
  return this.service.completeMaintenance(id, body, user);
}

@UseGuards(WriteAccessGuard)
@Post(':id/readiness/confirm')
confirmReadiness(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body() body: ConfirmWeaponReadinessDto,
): Promise<WeaponSystem> {
  return this.service.confirmReadiness(id, body, user);
}

}
