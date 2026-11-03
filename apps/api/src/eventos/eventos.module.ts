import { Global, Module } from '@nestjs/common';
import { EventosGateway } from './eventos.gateway';
import { EventosService } from './eventos.service';

@Global()
@Module({ providers: [EventosGateway, EventosService], exports: [EventosService] })
export class EventosModule {}
