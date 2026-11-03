import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { NOMES_IDIOMA, type Configuracoes, type Fala, type TraducaoFala } from '@ponto/shared';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';
import { TextoIaService } from '../ia/texto-ia.service';
import { SessoesService } from '../sessoes/sessoes.service';

/** Nome do idioma em inglês ajuda o modelo a não confundir (ex.: pt-PT x pt-BR). */
const EM_INGLES: Partial<Record<Configuracoes['traducaoDestino'], string>> = {
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'European Portuguese',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
};
/** Falas guardadas por sessão (só na memória; somem ao fechar o app). */
const MAX_POR_SESSAO = 2000;

/**
 * Tradução em tempo real: cada fala nova (fechada) é traduzida pelo modelo
 * rápido e vai para as janelas. Uma chamada curta por fala. Falas que já estão
 * no idioma de destino voltam sem tradução. No modo aprendizado, as suas falas
 * também ganham uma correção curta.
 */
@Injectable()
export class TraducaoService implements OnModuleInit {
  private readonly log = new Logger('Traducao');
  private readonly porSessao = new Map<string, Map<string, TraducaoFala>>();

  constructor(
    private readonly sessoes: SessoesService,
    private readonly config: ConfiguracoesService,
    private readonly texto: TextoIaService,
    private readonly eventos: EventosService,
  ) {}

  onModuleInit(): void {
    this.sessoes.aoNovaFala((f) => void this.traduzir(f));
  }

  listar(sessaoId: string): TraducaoFala[] {
    return [...(this.porSessao.get(sessaoId)?.values() ?? [])];
  }

  private async traduzir(f: Fala): Promise<void> {
    const c = await this.config.obter();
    if (!c.traducaoLigada) return;
    const minha = f.canal === 'microfone';
    if ((c.traducaoDe === 'outros' && minha) || (c.traducaoDe === 'eu' && !minha)) return;
    if (f.texto.trim().length < 2) return;
    const aprender = c.traducaoAprendizado && minha;
    const destino = `${EM_INGLES[c.traducaoDestino] ?? NOMES_IDIOMA[c.traducaoDestino]} (${c.traducaoDestino})`;
    const sistema = aprender
      ? `You help someone practice a language during a live call. For the user's sentence, return ONLY JSON {"traducao": string|null, "correcao": string|null}.\n` +
        `- traducao: the sentence translated to ${destino}; null if it is already in that language.\n` +
        `- correcao: if the sentence has a grammar, word choice or naturalness problem in the language it was spoken, the corrected natural version in that same language (max 25 words); otherwise null.`
      : `Translate the text to ${destino}. Natural spoken style, keep names and numbers. Reply with the translation only. If it is already in that language, reply exactly: =`;
    try {
      const bruto = await this.texto.gerar({
        origem: 'traducao',
        sessaoId: f.sessaoId,
        maxTokens: 300,
        timeoutMs: 20_000,
        mensagens: [
          { papel: 'system', conteudo: sistema },
          { papel: 'user', conteudo: f.texto },
        ],
      });
      const t = aprender ? lerAprendizado(bruto) : { texto: limpar(bruto), correcao: null };
      if (!t.texto && !t.correcao) return;
      const traducao: TraducaoFala = { sessaoId: f.sessaoId, falaId: f.id, texto: t.texto, correcao: t.correcao };
      const mapa = this.porSessao.get(f.sessaoId) ?? new Map<string, TraducaoFala>();
      mapa.set(f.id, traducao);
      if (mapa.size > MAX_POR_SESSAO) mapa.delete(mapa.keys().next().value!);
      this.porSessao.set(f.sessaoId, mapa);
      this.eventos.emitir({ tipo: 'transcricao.traducao', traducao });
    } catch (e) {
      this.log.warn(`tradução falhou: ${(e as Error).message}`);
    }
  }
}

function limpar(s: string): string | null {
  const t = s.trim().replace(/^["“]|["”]$/g, '');
  return !t || t === '=' ? null : t;
}

export function lerAprendizado(bruto: string): { texto: string | null; correcao: string | null } {
  const json = bruto.slice(bruto.indexOf('{'), bruto.lastIndexOf('}') + 1);
  try {
    const o = JSON.parse(json) as { traducao?: unknown; correcao?: unknown };
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return { texto: str(o.traducao), correcao: str(o.correcao) };
  } catch {
    return { texto: limpar(bruto), correcao: null };
  }
}
