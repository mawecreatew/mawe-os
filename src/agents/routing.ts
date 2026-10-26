/**
 * Encaminhamento do coordenador — POR REGRAS LOCAIS, sem IA.
 *
 * Enquanto nenhum modelo de IA estiver conectado, o coordenador usa palavras-chave
 * para sugerir qual especialista deveria receber o pedido. O resultado é
 * mostrado como "sugestão de encaminhamento", nunca como resposta de IA.
 * Quando houver um modelo conectado, esta função continua útil como
 * primeira triagem barata e transparente.
 */
import { normalizeText } from '../core/format.ts';
import type { AgentId } from '../domain/types.ts';

type Specialist = Exclude<AgentId, 'coordenador'>;

const KEYWORDS: Record<Specialist, string[]> = {
  comercial: [
    'proposta', 'orcamento', 'lead', 'oportunidade', 'abordagem', 'prospec', 'acompanhamento', 'follow',
    'negocia', 'preco', 'venda', 'vender', 'fechar', 'convers', 'qualific', 'potencial cliente',
    'mensagem para', 'responder', 'whatsapp', 'instagram', 'linkedin', 'desconto', 'parcelamento', 'funil',
  ],
  organizacao: [
    'tarefa', 'prazo', 'priorid', 'prioriz', 'pendenc', 'agenda', 'cronograma', 'organiz', 'semana',
    'amanha', 'hoje', 'atras', 'responsavel', 'decisao', 'decisoes', 'planejar o dia', 'checklist',
    'quem faz', 'distribuir',
  ],
  tecnico: [
    'codigo', 'github', 'repositorio', 'deploy', 'publicar', 'publicacao', 'bug', 'erro', 'html', 'css',
    'javascript', 'typescript', 'react', 'layout', 'responsiv', 'mobile', 'performance', 'velocidade',
    'seo', 'dominio', 'hospedagem', 'ssl', 'formulario', 'commit', 'pull request', 'estrutura tecnica',
    'componente', 'api',
  ],
};

export interface RoutingResult {
  /** Agente sugerido. `coordenador` quando não há sinal claro. */
  agentId: AgentId;
  matched: string[];
  /** Pontuação de cada especialista (quantas palavras-chave apareceram). */
  scores: Record<Specialist, number>;
  ambiguous: boolean;
}

export function routeRequest(text: string): RoutingResult {
  const normalized = normalizeText(text);
  const scores = { comercial: 0, organizacao: 0, tecnico: 0 } as Record<Specialist, number>;
  const matchedBy: Record<Specialist, string[]> = { comercial: [], organizacao: [], tecnico: [] };

  for (const agent of Object.keys(KEYWORDS) as Specialist[]) {
    for (const keyword of KEYWORDS[agent]) {
      if (normalized.includes(keyword)) {
        scores[agent]++;
        matchedBy[agent].push(keyword);
      }
    }
  }

  const ranked = (Object.keys(scores) as Specialist[]).sort((a, b) => scores[b] - scores[a]);
  const [best, second] = ranked;
  if (scores[best] === 0) {
    return { agentId: 'coordenador', matched: [], scores, ambiguous: true };
  }
  const ambiguous = scores[best] === scores[second];
  return {
    agentId: ambiguous ? 'coordenador' : best,
    matched: ambiguous ? [...matchedBy[best], ...matchedBy[second]] : matchedBy[best],
    scores,
    ambiguous,
  };
}
