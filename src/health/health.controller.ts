import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './database-health.indicator';

interface LivenessResponse {
  status: 'ok';
  timestamp: string;
}

interface ReadinessResponse extends LivenessResponse {
  checks: {
    database: 'up';
  };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealthIndicator) {}

  @Get('live')
  @HealthCheck()
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  async readiness(): Promise<ReadinessResponse> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'DATABASE_NOT_READY',
        message: 'Database readiness check failed.',
      });
    }

    return {
      status: 'ok',
      checks: {
        database: 'up',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
