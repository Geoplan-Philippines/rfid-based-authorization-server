import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseBody = exceptionResponse as {
          message?: string | string[];
          error?: string;
        };

        message = responseBody.message ?? exception.message;
        error = responseBody.error ?? exception.name;
      }
    } else if (exception instanceof Error) {
      error = exception.name;
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      error: error,
      path: request.url,
      timestamp: new Date().toISOString(),
    })
  }
}