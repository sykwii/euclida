import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface QueryFailedLike {
  code?: string;
  detail?: string;
  message?: string;
}

function isQueryFailedLike(value: unknown): value is QueryFailedLike {
  return !!value && typeof value === 'object' && 'code' in value;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalizeException(exception);

    if (normalized.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${normalized.statusCode}`,
        normalized.logMessage,
      );
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
    logMessage?: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return {
          statusCode,
          error: exception.name,
          message: body,
        };
      }

      if (body && typeof body === 'object') {
        const payload = body as {
          error?: string;
          message?: string | string[];
        };

        return {
          statusCode,
          error: payload.error || exception.name,
          message: payload.message || exception.message,
        };
      }
    }

    if (isQueryFailedLike(exception) && exception.code === '22P02') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Некоректний UUID або формат параметра',
      };
    }

    const message =
      exception instanceof Error ? exception.stack || exception.message : String(exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Внутрішня помилка сервера',
      logMessage: message,
    };
  }
}
