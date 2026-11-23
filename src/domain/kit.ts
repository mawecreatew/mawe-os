/** Orçamento rápido do Kit: soma os serviços escolhidos e monta a mensagem. */
import type { ISODate } from '../core/dates.ts';
import { formatCurrency } from '../core/format.ts';
import { effectivePrice, promoActive, serviceIncludes } from './business.ts';
import { agencyOf } from './daily.ts';
import type { AppData, ID, Service } from './types.ts';

export interface QuickQuote {
  services: Service[];
  oneTime: number;
  monthly: number;
  discount: number;
  /** Total único depois do desconto. */
  total: number;
  hasPromo: boolean;
}

export function quickQuote(data: AppData, serviceIds: readonly ID[], discountPct: number, today: ISODate): QuickQuote {
  const services = data.services.filter((s) => s.active && serviceIds.includes(s.id));
  let oneTime = 0;
  let monthly = 0;
  for (const s of services) {
    if (s.billing === 'mensal') monthly += effectivePrice(s, today);
    else oneTime += effectivePrice(s, today);
  }
  const pct = Math.min(50, Math.max(0, Number.isFinite(discountPct) ? discountPct : 0));
  const discount = Math.round(oneTime * pct) / 100;
  return { services, oneTime, monthly, discount, total: oneTime - discount, hasPromo: services.some((s) => promoActive(s, today)) };
}

/** Mensagem pronta para mandar no WhatsApp. */
export function quoteMessage(data: AppData, q: QuickQuote, clientName: string, today: ISODate): string {
  const agency = agencyOf(data);
  const first = clientName.trim().split(/\s+/)[0];
  const lines: string[] = [`Oi${first ? `, ${first}` : ''}! Segue o orçamento da ${agency.name}:`, ''];
  for (const s of q.services) {
    const price = effectivePrice(s, today);
    const promo = promoActive(s, today) ? ` (de ${formatCurrency(s.price, true)} por ${formatCurrency(price, true)}${s.promoLabel ? `, ${s.promoLabel}` : ''})` : '';
    lines.push(`• ${s.name}: ${formatCurrency(price, true)}${s.billing === 'mensal' ? '/mês' : ''}${promo}`);
    for (const item of serviceIncludes(s).slice(0, 4)) lines.push(`   - ${item}`);
  }
  lines.push('');
  if (q.oneTime) {
    if (q.discount) lines.push(`Desconto: ${formatCurrency(q.discount, true)}`);
    lines.push(`Total: ${formatCurrency(q.total, true)}`);
  }
  if (q.monthly) lines.push(`Mensal: ${formatCurrency(q.monthly, true)}/mês`);
  lines.push('', agency.paymentTerms, '', 'O domínio fica no seu nome e a taxa anual é paga direto no Registro.br. Qualquer dúvida, estou à disposição!');
  return lines.join('\n');
}
