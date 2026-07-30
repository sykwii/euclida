import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  login!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
