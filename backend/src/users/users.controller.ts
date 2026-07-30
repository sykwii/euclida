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
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, type UserResponse } from './users.service';

@UseGuards(JwtAuthGuard, AdminOnlyGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(): Promise<UserResponse[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<UserResponse> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
