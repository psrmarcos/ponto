import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** Valida o corpo/params com um schema do @ponto/shared: `@Body(new ZodPipe(Schema))`. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(valor: unknown): T {
    const r = this.schema.safeParse(valor);
    if (!r.success) {
      throw new BadRequestException({
        mensagem: 'dados inválidos',
        problemas: r.error.issues.map((i) => ({ caminho: i.path.join('.'), mensagem: i.message })),
      });
    }
    return r.data;
  }
}
