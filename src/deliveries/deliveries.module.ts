import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SlackModule } from '../slack/slack.module';
import { ContentSelectionService } from './content-selection.service';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryOrchestratorService } from './delivery-orchestrator.service';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [AuditModule, SlackModule],
  controllers: [DeliveriesController, RunsController],
  providers: [DeliveriesService, RunsService, DeliveryOrchestratorService, ContentSelectionService],
  exports: [DeliveryOrchestratorService, ContentSelectionService],
})
export class DeliveriesModule {}
