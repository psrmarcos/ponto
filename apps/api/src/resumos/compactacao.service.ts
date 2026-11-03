import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Fala } from '@ponto/shared';
import { SessoesService } from '../sessoes/sessoes.service';
import { TextoIaService } from '../ia/texto-ia.service';

/** Quando as falas ainda fora do resumo passam disso, o começo delas é resumido. */
export const LIMITE_CHARS_BRUTOS = 9000;
/** O fim da conversa fica sempre em texto cru (é o que mais importa para responder). */
export const CHARS_CRUS_NO_FIM = 3000;
const ESPERA_MS = 3000;

/**
 * Resumo contínuo do começo da call. Roda em segundo plano com o modelo rápido,
 * longe do caminho da resposta: quando o chat precisa, o resumo já está pronto.
 * Assim uma call de uma hora não manda 60 minutos de transcrição a cada pergunta.
 */
@Injectable()
export class CompactacaoService implements OnModuleInit {
  private readonly log = new Logger('Compactacao');
  private readonly agendados = new Map<string, NodeJS.Timeout>();
  private readonly rodando = new Set<string>();

  constructor(
    private readonly sessoes: SessoesService,
    private readonly texto: TextoIaService,
  ) {}

  onModuleInit(): void {
    this.sessoes.aoNovaFala((f) => this.agendar(f.sessaoId));
  }

  private agendar(sessaoId: string): void {
    if (this.agendados.has(sessaoId)) return;
    this.agendados.set(
      sessaoId,
      setTimeout(() => {
        this.agendados.delete(sessaoId);
        void this.compactarSePreciso(sessaoId);
      }, ESPERA_MS),
    );
  }

  async compactarSePreciso(sessaoId: string): Promise<void> {
    if (this.rodando.has(sessaoId)) return;
    this.rodando.add(sessaoId);
    try {
      const anterior = this.sessoes.resumoParcial(sessaoId);
      const versao = this.sessoes.versao(sessaoId);
      const falas = await this.sessoes.falasApos(sessaoId, anterior?.ateMs ?? -1);
      const lote = escolherLote(falas);
      if (!lote.length) return;
      const transcricao = await this.sessoes.formatar(lote);
      const resumo = await this.texto.gerar({
        origem: 'compactacao',
        sessaoId,
        maxTokens: 700,
        mensagens: [
          {
            papel: 'system',
            conteudo:
              'Você resume o andamento de uma call para outra IA que vai ajudar o usuário a responder ao vivo. ' +
              'Escreva em português, em tópicos curtos, no máximo 200 palavras: assunto, quem é quem, perguntas feitas e o que o usuário respondeu, ' +
              'números, nomes, decisões e pendências. Só fatos ditos na call. Sem introdução.',
          },
          {
            papel: 'user',
            conteudo: `${anterior ? `Resumo até agora:\n${anterior.texto}\n\n` : ''}Falas seguintes:\n${transcricao}\n\nDevolva o resumo atualizado de tudo.`,
          },
        ],
      });
      // Se apagaram falas enquanto o resumo era escrito, ele está velho.
      if (!resumo || this.sessoes.versao(sessaoId) !== versao) return;
      this.sessoes.definirResumoParcial(sessaoId, { texto: resumo, ateMs: lote[lote.length - 1]!.inicioMs });
    } catch (e) {
      this.log.warn(`não resumiu: ${(e as Error).message}`);
    } finally {
      this.rodando.delete(sessaoId);
    }
  }
}

/** As falas a resumir: tudo menos o fim recente, e só quando o acumulado passou do limite. */
export function escolherLote<F extends Pick<Fala, 'texto' | 'inicioMs'>>(falas: F[]): F[] {
  const total = falas.reduce((n, f) => n + f.texto.length + 16, 0);
  if (total <= LIMITE_CHARS_BRUTOS) return [];
  let fim = 0;
  let i = falas.length;
  while (i > 0 && fim < CHARS_CRUS_NO_FIM) fim += falas[--i]!.texto.length + 16;
  return falas.slice(0, i);
}
