import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.service.login(body);
  }
}
