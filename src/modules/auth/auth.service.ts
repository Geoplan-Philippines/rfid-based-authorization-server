import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async registerUser(body: RegisterUserDto) {
    return this.usersService.createUser(body);
  }
}
