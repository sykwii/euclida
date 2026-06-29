import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateShellCompatibleChargeDto } from './dto/create-shell-compatible-charge.dto';
import { ShellCompatibleCharge } from './shell-compatible-charge.entity';
import { ShellCompatibleChargesService } from './shell-compatible-charges.service';
import { UpdateShellCompatibleChargeDto } from './dto/update-shell-compatible-charge.dto';

@Controller('shell-compatible-charges')
export class ShellCompatibleChargesController {
  constructor(private readonly service: ShellCompatibleChargesService) {}

  @Get()
  findAll(): Promise<ShellCompatibleCharge[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateShellCompatibleChargeDto): Promise<ShellCompatibleCharge> {
    return this.service.create(body);
  }
  @Get(':id')
findOne(@Param('id') id: string): Promise<ShellCompatibleCharge> {
  return this.service.findOne(id);
}

@Patch(':id')
update(
  @Param('id') id: string,
  @Body() body: UpdateShellCompatibleChargeDto,
): Promise<ShellCompatibleCharge> {
  return this.service.update(id, body);
}

@Delete(':id')
remove(@Param('id') id: string): Promise<void> {
  return this.service.remove(id);
}
}