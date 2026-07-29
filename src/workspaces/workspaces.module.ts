import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SlackModule } from '../slack/slack.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [AuditModule, SlackModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
