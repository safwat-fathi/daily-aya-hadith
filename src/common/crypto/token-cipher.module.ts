import { Module } from '@nestjs/common';
import { TokenCipherService } from './token-cipher.service';

@Module({
  providers: [TokenCipherService],
  exports: [TokenCipherService],
})
export class TokenCipherModule {}
