import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { QuranFoundationModule } from '../quran-foundation/quran-foundation.module';
import { ReviewModule } from '../review/review.module';
import { StreamsModule } from '../streams/streams.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ContentUiController } from './content-ui.controller';
import { LoginController } from './login.controller';
import { QuranImportUiController } from './quran-import-ui.controller';
import { StreamsUiController } from './streams-ui.controller';
import { SubscribersUiController } from './subscribers-ui.controller';

@Module({
  imports: [
    ContentModule,
    QuranFoundationModule,
    ReviewModule,
    StreamsModule,
    SubscribersModule,
    WorkspacesModule,
  ],
  controllers: [
    LoginController,
    ContentUiController,
    QuranImportUiController,
    StreamsUiController,
    SubscribersUiController,
  ],
  providers: [AdminUiSessionGuard],
})
export class AdminUiModule {}
