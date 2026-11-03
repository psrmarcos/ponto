import { describe, expect, it } from 'vitest';
import { abrirBanco, migrarBanco } from '../db/conexao';
import { falas, sessoes, usoIa } from '../db/schema';
import { EstatisticasService } from './estatisticas.service';

describe('EstatisticasService', () => {
  it('soma sessões, sua parte da fala e custos', async () => {
    const { banco, sqlite } = abrirBanco(':memory:');
    await migrarBanco(banco, sqlite);
    const agora = new Date();
    await banco.insert(sessoes).values({ id: 's1', agenteId: 'geral', iniciadaEm: agora, titulo: 'x' });
    await banco.insert(falas).values([
      { id: 'f1', sessaoId: 's1', canal: 'microfone', texto: 'olá tudo bem', inicioMs: 0, fimMs: 3000, falante: null },
      { id: 'f2', sessaoId: 's1', canal: 'sistema', texto: 'tudo', inicioMs: 3000, fimMs: 4000, falante: null },
    ]);
    await banco.insert(usoIa).values({ id: 'u1', criadoEm: agora, sessaoId: 's1', provedor: 'x', modelo: 'm', origem: 'chat', custoUsd: 0.5 });
    const e = await new EstatisticasService(banco).obter();
    expect(e.sessoes.total).toBe(1);
    expect(e.falas.suaParte).toBeCloseTo(0.75);
    expect(e.palavras).toEqual({ suas: 3, outros: 1 });
    expect(e.custo.mesUsd).toBeCloseTo(0.5);
    expect(e.porDia.at(-1)!.sessoes).toBe(1);
    expect(e.porDia.at(-1)!.minutos).toBeCloseTo(4000 / 60000);
  });
});
