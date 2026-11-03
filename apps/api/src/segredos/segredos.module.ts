import { Global, Module } from '@nestjs/common';
import { SegredosService } from './segredos.service';

@Global()
@Module({ providers: [SegredosService], exports: [SegredosService] })
export class SegredosModule {}
