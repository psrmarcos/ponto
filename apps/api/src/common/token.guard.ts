import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { TOKEN_HEADER } from '@ponto/shared';
import { env } from '../env';

/** Constant-time comparison to avoid leaking the token through timing side-channels. */
export function isValidToken(received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(env.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Every HTTP route requires the random execution token. Without this, any page
 * open in the browser could call the API on 127.0.0.1.
 */
@Injectable()
export class TokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!isValidToken(req.headers[TOKEN_HEADER])) throw new UnauthorizedException('invalid token');
    return true;
  }
}
