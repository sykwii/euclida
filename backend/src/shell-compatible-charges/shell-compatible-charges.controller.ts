import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateShellCompatibleChargeDto } from './dto/create-shell-compatible-charge.dto';
import { ShellCompatibleCharge } from './shell-compatible-charge.entity';
import { ShellCompatibleChargesService } from './shell-compatible-charges.service';
import { UpdateShellCompatibleChargeDto } from './dto/update-shell-compatible-charge.dto';

@UseGuards(JwtAuthGuard)
@Controller('shell-compatible-charges')
export class ShellCompatibleChargesController {
  constructor(private readonly service: ShellCompatibleChargesService) {}

  @Get()
  findAll(): Promise<ShellCompatibleCharge[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateShellCompatibleChargeDto): Promise<ShellCompatibleCharge> {
    return this.service.create(body);
  }
  @Get(':id')
findOne(@Param('id') id: string): Promise<ShellCompatibleCharge> {
  return this.service.findOne(id);
}

@UseGuards(WriteAccessGuard, MainScopeGuard)
@Patch(':id')
update(
  @Param('id') id: string,
  @Body() body: UpdateShellCompatibleChargeDto,
): Promise<ShellCompatibleCharge> {
  return this.service.update(id, body);
}

@UseGuards(WriteAccessGuard, MainScopeGuard)
@Delete(':id')
remove(@Param('id') id: string): Promise<void> {
  return this.service.remove(id);
}
}
