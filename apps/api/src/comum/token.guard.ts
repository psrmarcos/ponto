import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CABECALHO_TOKEN } from '@ponto/shared';
import { ambiente } from '../ambiente';

/** Compara em tempo constante para não vazar o token por medição de tempo. */
export function tokenValido(recebido: unknown): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(ambiente.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Toda rota HTTP exige o token aleatório da execução. Sem isso, qualquer página
 * aberta no navegador conseguiria chamar a API em 127.0.0.1.
 */
@Injectable()
export class TokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!tokenValido(req.headers[CABECALHO_TOKEN])) throw new UnauthorizedException('token inválido');
    return true;
  }
}
