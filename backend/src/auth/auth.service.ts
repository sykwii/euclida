import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(data: LoginDto) {
    const user = await this.usersService.findByLogin(data.login);

    if (!user) {
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    const passwordValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      login: user.login,
      role: user.role,
      scope: user.scope,
      unitId: user.unitId,
      fullName: user.fullName,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        login: user.login,
        fullName: user.fullName,
        role: user.role,
        scope: user.scope,
        unitId: user.unitId,
      },
    };
  }
}