import type { User } from '@prisma/client';

import type { PaginatedResponse } from 'src/common/responses/paginated-api.response';

export type SafeUser = Omit<User, 'password'>;

export type UserListResponse = PaginatedResponse<SafeUser>;
