import { Global, Module } from '@nestjs/common';
import { CLOCK } from './clock';
import { SystemClock } from './system.clock';

/**
 * Global, matching `PrismaModule` and `AppConfigModule`: the clock is infrastructure that the
 * scheduler, delivery orchestration, and stream services all read, and threading an import
 * through each of them would add noise without adding isolation.
 */
@Global()
@Module({
  providers: [SystemClock, { provide: CLOCK, useExisting: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
