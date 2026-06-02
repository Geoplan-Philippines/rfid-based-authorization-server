import { PaginatedResponse } from "./paginated-api.response";

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginatedResponse<unknown>['meta'];
}