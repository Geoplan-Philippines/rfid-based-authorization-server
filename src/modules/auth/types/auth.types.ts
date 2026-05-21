import type { Role, User } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

export type AuthenticatedUser = Pick<User, 'id' | 'email' | 'role'>;

export type LoginUser = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

export type AuthResult = LoginUser & {
  accessToken: string;
};
