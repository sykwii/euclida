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
import { CancelServiceOrderDto } from './dto/cancel-service-order.dto';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { RejectServiceOrderDto } from './dto/reject-service-order.dto';
import { RespondServiceOrderDeliveryDto } from './dto/respond-service-order-delivery.dto';
import { SendServiceOrderDto } from './dto/send-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ServiceOrder } from './service-order.entity';
import {
  ServiceOrderMapResult,
  ServiceOrdersService,
} from './service-orders.service';
import { ReconCoreIntegrationService } from '../modules/recon/services/recon-core-integration.service';

@UseGuards(JwtAuthGuard)
@Controller('service-orders')
export class ServiceOrdersController {
  constructor(
    private readonly service: ServiceOrdersService,
    private readonly reconCore: ReconCoreIntegrationService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<ServiceOrder[]> {
    return this.service.findAll(user);
  }

  @Get('map-results')
  findMapResults(@CurrentUser() user: AuthUser): Promise<ServiceOrderMapResult[]> {
    return this.service.findMapResults(user);
  }

  @Get('deliveries')
  findDeliveries(@CurrentUser() user: AuthUser) {
    return this.service.findDeliveries(user);
  }

  @Get('deliveries/unread-count')
  countUnreadDeliveries(@CurrentUser() user: AuthUser) {
    return this.service.countUnreadDeliveries(user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('deliveries/:deliveryId/view')
  markDeliveryViewed(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.service.markDeliveryViewed(deliveryId, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('deliveries/:deliveryId/respond')
  respondDelivery(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId') deliveryId: string,
    @Body() body: RespondServiceOrderDeliveryDto,
  ) {
    return this.service.respondDelivery(deliveryId, body, user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ServiceOrder> {
    return this.service.findOne(id, user);
  }

  @Get(':id/deliveries')
  findOrderDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.service.findOrderDeliveries(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateServiceOrderDto,
  ): Promise<ServiceOrder> {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('puar/:id/accept')
  async acceptPuarProposal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ServiceOrder> {
    const proposal = await this.reconCore.getPuarProposalForCore(id);
    const order = await this.service.createFromReconPuar(proposal, user);
    await this.reconCore.markPuarAccepted(id, order.id);
    return order;
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateServiceOrderDto,
  ): Promise<ServiceOrder> {
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
  @Post(':id/suggestions')
  getSuggestions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.service.getSuggestions(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/select-position')
  selectPosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      firePositionId: string;
      weaponSystemId: string;
      shotConfigurationId?: string;
      shellId?: string;
      chargeId?: string;
    },
  ) {
    return this.service.selectPosition(id, body, user);
  }

@UseGuards(WriteAccessGuard)
@Post(':id/select-air-asset')
selectAirAsset(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
  @Body()
  body: {
    airAssetPositionId: string;
    droneModelId: string;
    warheadTypeId: string;
  },
): Promise<ServiceOrder> {
  return this.service.selectAirAsset(id, body, user);
}


  @UseGuards(WriteAccessGuard)
  @Post(':id/send')
  sendToUnit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SendServiceOrderDto,
  ): Promise<ServiceOrder> {
    return this.service.sendToUnit(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ServiceOrder> {
    return this.service.accept(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RejectServiceOrderDto,
  ): Promise<ServiceOrder> {
    return this.service.reject(id, body.reason, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ServiceOrder> {
    return this.service.start(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CompleteServiceOrderDto,
  ): Promise<ServiceOrder> {
    return this.service.complete(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CancelServiceOrderDto,
  ): Promise<ServiceOrder> {
    return this.service.cancel(id, body.reason, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post(':id/reopen')
  reopenRejected(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ServiceOrder> {
    return this.service.reopenRejected(id, user);
  }
}
