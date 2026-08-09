import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { StreamsModule } from '../streams/streams.module';
import { SchedulerLockService } from './scheduler.lock';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), StreamsModule, DeliveriesModule],
  providers: [SchedulerService, SchedulerLockService],
})
export class SchedulerModule {}
