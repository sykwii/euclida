import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { Charge } from './charge.entity';
import { ChargesService } from './charges.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

@UseGuards(JwtAuthGuard)
@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Get()
  findAll(): Promise<Charge[]> {
    return this.chargesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Charge> {
    return this.chargesService.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateChargeDto): Promise<Charge> {
    return this.chargesService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateChargeDto,
  ): Promise<Charge> {
    return this.chargesService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.chargesService.remove(id);
  }
}
