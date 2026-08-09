import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';

@Module({
  imports: [AuditModule, DeliveriesModule],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
