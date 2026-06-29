import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Charge } from './charge.entity';
import { ChargesService } from './charges.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

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

  @Post()
  create(@Body() body: CreateChargeDto): Promise<Charge> {
    return this.chargesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateChargeDto,
  ): Promise<Charge> {
    return this.chargesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.chargesService.remove(id);
  }
}