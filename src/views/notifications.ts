/**
 * Avisos: tudo que venceu ou vence hoje e é seu (ou da agência toda), numa
 * lista só. É o mesmo número do sininho do topo e do item Avisos do menu.
 */
import { pluralize } from '../core/format.ts';
import { html } from '../core/html.ts';
import { notificationsFor } from '../domain/insights.ts';
import { allowed, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { emptyState, pageHeader } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { focusRow } from './dashboard.ts';

export const notificationsView: View = {
  title: () => 'Avisos',
  render: () => {
    const { data, currentUser } = store();
    const t = today();
    const items = notificationsFor(data, t, currentUser.id, { finance: allowed('finance:view') });
    const late = items.filter((i) => i.overdue);
    const sorted = [...late, ...items.filter((i) => !i.overdue)];
    return html`
      ${pageHeader({
        title: 'Avisos',
        subtitle: items.length ? `${pluralize(items.length, 'aviso', 'avisos')} para você hoje${late.length ? ` · ${pluralize(late.length, 'atrasado', 'atrasados')}` : ''}` : 'Nada pendente para você hoje',
      })}
      <div class="panel todo-panel">
        ${items.length
          ? html`<ul class="todos">${sorted.map((item) => focusRow(item, t))}</ul>`
          : emptyState({ icon: 'check', title: 'Tudo em dia', text: 'Prazos de entrega, follow-ups, prévias sem resposta, pagamentos e tarefas aparecem aqui no dia certo.' })}
      </div>
      <p class="muted small">${icon('info', 13)} Aparecem aqui os avisos com você como responsável e os da agência toda (sem responsável). A lista completa da equipe fica no Pra fazer hoje, no Início.</p>
    `;
  },
};
