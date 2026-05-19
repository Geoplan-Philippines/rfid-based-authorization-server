import type { User } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
};

export type AuthenticatedUser = Pick<User, 'id' | 'email'>;

export type LoginUser = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

export type AuthResult = LoginUser & {
  accessToken: string;
};
