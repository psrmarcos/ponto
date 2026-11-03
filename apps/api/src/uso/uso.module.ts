import { Global, Module } from '@nestjs/common';
import { UsoController } from './uso.controller';
import { UsoService } from './uso.service';

@Global()
@Module({ controllers: [UsoController], providers: [UsoService], exports: [UsoService] })
export class UsoModule {}
