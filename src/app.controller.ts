import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  @Get()
  showLanding(@Res() response: Response): void {
    response.render('landing', { title: 'Aya & Hadith Bot' });
  }
}
