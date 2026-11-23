/**
 * Administrativo: um lugar só para o lado da gestão (financeiro, relatório,
 * contratos, serviços, equipe, sistema), com a divisão do dinheiro e a cópia
 * dos dados em planilha.
 */
import { monthKey, monthLabel } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney } from '../core/format.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { buildXlsx } from '../core/xlsx.ts';
import { backupFileName, backupSheets } from '../domain/backup.ts';
import { contractsEndingSoon } from '../domain/clientcare.ts';
import { monthSummary } from '../domain/finance.ts';
import { teamMembers } from '../domain/people.ts';
import type { MoneySplit } from '../domain/types.ts';
import { saveSplit, splitAmounts, splitOf } from '../domain/workspace.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, notice, pageHeader, panel } from '../ui/components.ts';
import { downloadFile } from '../ui/download.ts';
import { formActions, textField } from '../ui/forms.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';

function card(href: string, iconName: IconName, title: string, text: string): SafeHtml {
  return html`<a class="admin-card" href="${href}">
    <span class="admin-card__icon">${icon(iconName, 20)}</span>
    <span class="admin-card__main"><strong>${title}</strong><small>${text}</small></span>
    ${icon('chevronRight', 16)}
  </a>`;
}

function renderCards(): SafeHtml {
  const { data } = store();
  const t = today();
  const month = monthKey(t);
  const finance = allowed('finance:view');
  const ending = contractsEndingSoon(data, t).length;
  return html`<div class="admin-grid">
    ${finance ? card('#/financeiro', 'wallet', 'Financeiro', `Entradas, saídas, caixa e o gráfico do faturamento`) : ''}
    ${card('#/relatorio', 'chart', 'Relatório do mês', `${monthLabel(month)} numa página, com PDF`)}
    ${card('#/contratos', 'repeat', 'Contratos e vencimentos', ending ? `${ending} vencendo nos próximos 30 dias` : 'Nenhum vencendo nos próximos 30 dias')}
    ${card('#/servicos', 'tag', 'Serviços e preços', `${data.services.filter((s) => s.active).length} serviços ativos`)}
    ${card('#/sistema', 'file', 'Dados da agência', 'Responsável, CPF ou CNPJ, Pix e WhatsApp (vão na proposta e no contrato)')}
    ${card('#/equipe', 'user', 'Equipe', `${teamMembers(data).length} pessoas com acesso`)}
    ${card('#/categorias', 'tag', 'Categorias', 'Origens dos leads, despesas, serviços e motivos de perda')}
    ${card('#/sistema', 'settings', 'Sistema', 'Conexão, cores e informações técnicas')}
  </div>`;
}

function renderSplit(): SafeHtml {
  if (!allowed('finance:view')) return html``;
  const { data } = store();
  const t = today();
  const month = monthKey(t);
  const split = splitOf(data);
  const summary = monthSummary(data, month);
  const amounts = splitAmounts(split, summary.received);
  const partners = teamMembers(data).filter((u) => split.partners[u.id] !== undefined);
  return panel({
    title: 'Divisão do dinheiro',
    icon: 'piggy',
    action: allowed('finance:edit') ? button({ label: 'Ajustar porcentagens', action: 'split:edit', icon: 'edit', variant: 'ghost', size: 'sm' }) : undefined,
    body: html`
      ${data.moneySplit ? '' : html`<p class="muted small">${icon('info', 13)} Sugestão inicial: 30% fica na agência e o resto é dividido entre os sócios. Ajuste para o que vocês combinaram.</p>`}
      <p class="split-intro">Do que entrou em ${monthLabel(month)} (${formatCurrency(summary.received, true)}):</p>
      <ul class="split-list">
        <li><span>Caixa da agência <small>${split.agency}%</small></span><strong>${formatCurrency(amounts.agency, true)}</strong></li>
        ${split.taxes ? html`<li><span>Impostos (MEI) <small>${split.taxes}%</small></span><strong>${formatCurrency(amounts.taxes, true)}</strong></li>` : ''}
        ${partners.map((u) => {
          const withdrawn = summary.withdrawnByPartner[u.id] ?? 0;
          return html`<li><span>${u.shortName} <small>${split.partners[u.id]}%</small></span><strong>${formatCurrency(amounts.partners[u.id] ?? 0, true)}</strong>
            <small class="split-list__note">já retirou ${formatCurrency(withdrawn, true)} no mês</small></li>`;
        })}
      </ul>
      <p class="panel__foot">${icon('info', 13)} É só a conta de como dividir. As retiradas de verdade continuam sendo lançadas no Financeiro (categoria "Retirada dos sócios").</p>
    `,
  });
}

function openSplitForm(): void {
  const { data } = store();
  const split = splitOf(data);
  const partners = teamMembers(data).filter((u) => u.role === 'socio');
  const val = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));
  openModal({
    title: 'Divisão do dinheiro',
    description: 'Porcentagem de cada entrada que vai para cada parte. Precisa somar 100%.',
    body: html`<form class="form" data-form="split:save">
      <div class="form-grid">
        ${textField({ name: 'agency', label: 'Caixa da agência (%)', value: val(split.agency), inputmode: 'decimal', autofocus: true })}
        ${textField({ name: 'taxes', label: 'Impostos (%)', value: val(split.taxes), inputmode: 'decimal', hint: 'Quando abrirem o MEI, o DAS é um valor fixo por mês; deixe 0 se preferir lançar como despesa.' })}
        ${partners.map((u) => textField({ name: `p_${u.id}`, label: `${u.shortName} (%)`, value: val(split.partners[u.id] ?? 0), inputmode: 'decimal' }))}
      </div>
      ${formActions('Salvar divisão')}
    </form>`,
  });
}

function renderBackup(): SafeHtml {
  return panel({
    title: 'Cópia dos dados',
    icon: 'download',
    body: html`
      <p>Baixe uma cópia de vez em quando (uma vez por mês já ajuda) e guarde no Drive. Se algo der errado, os dados estão salvos com vocês.</p>
      <div class="quick-actions">
        ${button({ label: 'Baixar planilha (.xlsx)', action: 'backup:xlsx', icon: 'download', variant: 'primary' })}
        ${allowed('finance:view') ? button({ label: 'Baixar cópia completa (.json)', action: 'backup:json', icon: 'database' }) : ''}
      </div>
      <p class="muted small">A planilha abre no Excel e no Google Planilhas, com uma aba para clientes, leads, projetos, tarefas, contratos${allowed('finance:view') ? ', financeiro e parcelas' : ''}. A cópia completa (.json) guarda tudo, do jeito que o sistema lê.</p>
    `,
  });
}

export const adminView: View = {
  title: () => 'Administrativo',
  render: () => html`
    ${pageHeader({ title: 'Administrativo', subtitle: 'A parte da gestão da Mawe num lugar só.' })}
    ${renderCards()}
    <div class="detail-grid">
      <div class="detail-grid__main">${renderSplit() ?? ''}${allowed('finance:view') ? '' : notice({ title: 'Financeiro restrito', text: 'Seu perfil não vê valores. A divisão do dinheiro aparece só para os sócios.', icon: 'lock' })}</div>
      <aside class="detail-grid__side">${renderBackup()}</aside>
    </div>
  `,
};

registerForms({
  'split:save': async (_form, values) => {
    requirePermission('finance:edit');
    const read = (name: string) => parseMoney(values.text(name) || '0') ?? NaN;
    const partners = teamMembers(store().data).filter((u) => u.role === 'socio');
    const split: MoneySplit = { agency: read('agency'), taxes: read('taxes'), partners: Object.fromEntries(partners.map((u) => [u.id, read(`p_${u.id}`)])) };
    await store().apply((draft) => saveSplit(draft, split));
    closeModal();
    toast('Divisão salva.');
  },
});

registerActions({
  'split:edit': () => openSplitForm(),
  'backup:xlsx': () => {
    const { data } = store();
    const bytes = buildXlsx(backupSheets(data, allowed('finance:view')));
    downloadFile(backupFileName(today(), 'xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Planilha baixada.');
  },
  'backup:json': () => {
    requirePermission('finance:view');
    downloadFile(backupFileName(today(), 'json'), JSON.stringify(store().data, null, 2), 'application/json');
    toast('Cópia completa baixada.');
  },
});
