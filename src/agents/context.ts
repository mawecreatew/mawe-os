/**
 * Monta resumos de contexto em texto a partir dos dados do sistema.
 * São gerados por regras fixas (sem IA) e servem como ponto de partida
 * para uma conversa com um agente — hoje para copiar, no futuro para enviar.
 */
import { formatShortDate } from '../core/dates.ts';
import { formatCurrency } from '../core/format.ts';
import { labelOf, OPPORTUNITY_STAGES } from '../domain/labels.ts';
import { peopleNames } from '../domain/people.ts';
import type { AppData, Opportunity } from '../domain/types.ts';

export function opportunityBriefing(data: AppData, opp: Opportunity, includeValue: boolean): string {
  const lines = [
    `Oportunidade: ${opp.company} (${opp.segment})`,
    `Contato: ${opp.contactName} · Origem: ${opp.source}`,
    `Etapa atual: ${labelOf(OPPORTUNITY_STAGES, opp.stage)}`,
    `Responsável: ${peopleNames(data, opp.ownerIds, '—')}`,
  ];
  if (includeValue) {
    lines.push(`Valor estimado: ${opp.estimatedValue === null ? 'não definido' : formatCurrency(opp.estimatedValue)}`);
  }
  if (opp.nextAction) lines.push(`Próxima ação: ${opp.nextAction}`);
  if (opp.followUpDate) lines.push(`Retorno previsto: ${formatShortDate(opp.followUpDate)}`);
  if (opp.notes) lines.push(`Observações: ${opp.notes}`);
  if (opp.history.length) {
    lines.push('Histórico recente:');
    for (const h of opp.history.slice(-3)) lines.push(`- ${h.text}`);
  }
  return `${lines.join('\n')}\n\nPedido: avalie o potencial desta oportunidade e sugira a próxima abordagem.`;
}
