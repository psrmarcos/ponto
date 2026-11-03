import { describe, expect, it } from 'vitest';
import { montarMensagens, TROCAS_NO_HISTORICO } from './prompt';

const base = {
  agente: { prompt: 'PROMPT DO AGENTE' },
  config: { nomeUsuario: '', contextoUsuario: '' },
  historico: [],
  pedido: { texto: 'oi', atalho: null, imagens: [] as string[] },
};

describe('montarMensagens', () => {
  it('coloca o prompt fixo primeiro e a pergunta por último', () => {
    const m = montarMensagens(base);
    expect(m[0]?.papel).toBe('system');
    expect(JSON.stringify(m[0])).toContain('PROMPT DO AGENTE');
    expect(m.at(-1)).toEqual({ papel: 'user', conteudo: 'oi' });
  });

  it('limita o histórico e corta respostas antigas longas', () => {
    const historico = Array.from({ length: 20 }, (_, i) => ({ pergunta: `p${i}`, perguntaPura: `p${i}`, resposta: 'x'.repeat(5000), charsTranscricao: 0 }));
    const m = montarMensagens({ ...base, historico });
    // system + 2 por troca + pergunta atual
    expect(m.length).toBe(1 + TROCAS_NO_HISTORICO * 2 + 1);
    expect(m[1]?.conteudo).toBe(`p${20 - TROCAS_NO_HISTORICO}`);
    expect((m[2]?.conteudo as string).length).toBeLessThan(1300);
  });

  it('usa o texto do atalho e manda imagens antes do texto', () => {
    const m = montarMensagens({ ...base, pedido: { texto: '', atalho: 'followUp', imagens: ['data:image/png;base64,AA'] } });
    const ultima = m.at(-1)?.conteudo as Array<{ tipo: string; texto?: string }>;
    expect(ultima[0]?.tipo).toBe('imagem');
    expect(ultima[1]?.texto).toMatch(/follow-up/);
  });

  it('marca o fim do prefixo estável para cache', () => {
    const m = montarMensagens({ ...base, config: { nomeUsuario: 'Marcos', contextoUsuario: 'dev' } });
    const partes = m[0]?.conteudo as Array<{ cache?: boolean }>;
    expect(partes.map((p) => !!p.cache)).toEqual([false, true]);
  });
});
