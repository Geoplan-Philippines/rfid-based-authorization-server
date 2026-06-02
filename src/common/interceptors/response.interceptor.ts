import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse } from '../responses/api.response';
import { PaginatedResponse } from '../responses/paginated-api.response';

// A handler that returned a PaginatedResponse ({ data, meta }) would otherwise get double-nested
// under the envelope's data. Detect it and hoist meta up to the top level.
const isPaginated = (value: unknown): value is PaginatedResponse<unknown> =>
  typeof value === 'object' && value !== null && 'data' in value && 'meta' in value;

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data): ApiResponse<T> => {
        // Read inside map: the route's status (e.g. 201 for POST) is only applied
        // after the handler resolves. Reading earlier yields Express's default 200.
        const statusCode = context.switchToHttp().getResponse().statusCode;

        if (isPaginated(data)) {
          return { 
            statusCode, 
            message: 'Success', 
            data: data.data as T, 
            meta: data.meta 
          };
        }

        return { 
          statusCode, 
          message: 'Success', 
          data 
        };
      }),
    );
  }
}
