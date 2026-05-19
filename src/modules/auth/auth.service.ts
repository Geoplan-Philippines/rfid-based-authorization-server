import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { LoginDTO } from './dto/login.dto';
import type { AuthResult, LoginUser } from './types/auth.types';
import type { SafeUser } from '../users/types/users.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async validateUser(loginDto: LoginDTO) {
    const user = await this.usersService.findUserByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Incorrect password');
    }

    return user;
  }

  async login(user: LoginUser): Promise<AuthResult> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      accessToken,
    };
  }
}
