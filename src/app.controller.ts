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

  @Get('privacy')
  showPrivacy(@Res() response: Response): void {
    response.render('privacy', { title: 'Privacy Policy' });
  }

  @Get('tos')
  showTos(@Res() response: Response): void {
    response.render('tos', { title: 'Terms of Service' });
  }

  @Get('support')
  showSupport(@Res() response: Response): void {
    response.render('support', { title: 'Support' });
  }
}
