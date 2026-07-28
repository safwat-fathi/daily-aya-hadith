import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [AuditModule, ContentModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
