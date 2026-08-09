import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runNotFound } from './deliveries.errors';
import { runDetailArgs, type RunDetail } from './deliveries.select';

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The cycle: which content was selected, the rendered snapshot, and every subscriber's
   * outcome — where a partial failure (some `SENT`, some `FAILED`) is actually diagnosed.
   */
  async getById(id: string): Promise<RunDetail> {
    const run = await this.prisma.deliveryRun.findUnique({
      where: { id },
      ...runDetailArgs,
    });

    if (run === null) {
      throw runNotFound(id);
    }

    return run;
  }
}
