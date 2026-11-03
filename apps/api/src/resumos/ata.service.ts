import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Fala, Sessao } from '@ponto/shared';
import { EventosService } from '../eventos/eventos.service';
import { SessoesService } from '../sessoes/sessoes.service';
import { TextoIaService } from '../ia/texto-ia.service';

/** Calls com menos falas que isso não ganham ata (testes, gravação sem querer). */
const MIN_FALAS = 4;
/** Transcrição muito longa: manda o fim (o modelo rápido aguenta bem mais, mas o custo cresce). */
const MAX_CHARS_TRANSCRICAO = 300_000;

const PROMPT_ATA = `Você escreve a ata de uma call a partir da transcrição. Português do Brasil, Markdown, direto ao ponto.
Formato exato:
# <título curto e específico da call, até 8 palavras>

<2 a 3 frases dizendo do que se tratou e como terminou>

## Pontos principais
- ...

## Decisões
- ... (omita a seção se não houve)

## Próximos passos
- [ ] responsável: tarefa (prazo, se dito) (omita a seção se não houve)

## Perguntas em aberto
- ... (omita a seção se não houve)

Regras: só o que foi dito na call, sem inventar. Nomes, números e datas exatos. A transcrição vem de reconhecimento de voz e pode ter erros: corrija termos óbvios, sem mudar o sentido. O usuário aparece pelo nome ou como "Você"; os outros como "Participante".`;

/**
 * Ata da reunião (note-taker): gerada quando a sessão é encerrada e salva no
 * banco junto com ela. O título da ata vira o título da sessão.
 */
@Injectable()
export class AtaService implements OnModuleInit {
  private readonly log = new Logger('Ata');

  constructor(
    private readonly sessoes: SessoesService,
    private readonly texto: TextoIaService,
    private readonly eventos: EventosService,
  ) {}

  onModuleInit(): void {
    this.sessoes.aoEncerrar((id) => void this.gerar(id).catch(() => undefined));
  }

  async gerar(sessaoId: string, forcar = false): Promise<void> {
    if (this.sessoes.gerandoResumo.has(sessaoId)) return;
    const falas = await this.sessoes.falas(sessaoId);
    if (falas.length < (forcar ? 1 : MIN_FALAS)) return;
    this.sessoes.gerandoResumo.add(sessaoId);
    this.eventos.emitir({ tipo: 'sessao.resumo', sessaoId, status: 'gerando' });
    try {
      let transcricao = await this.sessoes.formatar(falas);
      if (transcricao.length > MAX_CHARS_TRANSCRICAO) transcricao = `(…)\n${transcricao.slice(-MAX_CHARS_TRANSCRICAO)}`;
      const ata = await this.texto.gerar({
        origem: 'resumo',
        sessaoId,
        maxTokens: 2000,
        timeoutMs: 180_000,
        mensagens: [
          { papel: 'system', conteudo: PROMPT_ATA },
          { papel: 'user', conteudo: `Transcrição:\n${transcricao}` },
        ],
      });
      if (!ata) throw new Error('O modelo não devolveu a ata.');
      const titulo = /^#\s+(.+)$/m.exec(ata)?.[1]?.trim().slice(0, 120);
      await this.sessoes.salvarResumo(sessaoId, ata, titulo);
      this.eventos.emitir({ tipo: 'sessao.resumo', sessaoId, status: 'pronto' });
    } catch (e) {
      const mensagem = (e as Error).message || 'Falhou ao gerar a ata.';
      this.log.warn(`ata falhou: ${mensagem}`);
      this.eventos.emitir({ tipo: 'sessao.resumo', sessaoId, status: 'erro', mensagem });
    } finally {
      this.sessoes.gerandoResumo.delete(sessaoId);
    }
  }
}

/** A sessão inteira num .md: ata (se houver) + transcrição com horário. */
export function sessaoEmMarkdown(sessao: Sessao, falas: Fala[], nomeUsuario: string): string {
  const data = new Date(sessao.iniciadaEm);
  const quando = `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const duracao = falas.length ? relogio(falas[falas.length - 1]!.fimMs) : '0:00';
  const partes: string[] = [];
  if (sessao.resumo) {
    // A ata já começa com "# Título".
    partes.push(sessao.resumo.replace(/^(#\s+.+)$/m, `$1\n\n_${quando} · ${duracao}_`));
  } else {
    partes.push(`# ${sessao.titulo}\n\n_${quando} · ${duracao}_`);
  }
  partes.push('## Transcrição');
  const linhas = falas.map((f) => {
    const quem = f.falante ?? (f.canal === 'microfone' ? nomeUsuario || 'Você' : 'Participante');
    return `**[${relogio(f.inicioMs)}] ${quem}:** ${f.texto}`;
  });
  partes.push(linhas.length ? linhas.join('\n\n') : '_Sem falas._');
  return `${partes.join('\n\n')}\n`;
}

function relogio(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
