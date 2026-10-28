/** Tráfego pago: campanhas (Meta Ads e outras), resultados anotados à mão e aprendizados. */
import { formatShortDate, monthKey, monthLabel, shiftMonth } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import {
  campaignState,
  campaignsInMonth,
  costPerResult,
  deleteCampaign,
  monthAdSpend,
  saveCampaign,
  type CampaignInput,
  type CampaignState,
} from '../domain/business.ts';
import { CAMPAIGN_OBJECTIVES } from '../domain/labels.ts';
import type { AppData, Campaign } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, pageHeader, segmented, statCard } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { month: null as string | null, owner: 'todos' as 'todos' | 'mawe' | 'clientes' };

const STATE_LABEL: Record<CampaignState, [string, 'info' | 'progress' | 'neutral']> = {
  agendada: ['Agendada', 'info'],
  ativa: ['Rodando', 'progress'],
  encerrada: ['Encerrada', 'neutral'],
};

const nf = new Intl.NumberFormat('pt-BR');

function ownerName(data: AppData, c: Pick<Campaign, 'clientId'>): string {
  return c.clientId ? data.clients.find((x) => x.id === c.clientId)?.company ?? 'Cliente removido' : 'MaweCreate';
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function openCampaignForm(campaign?: Campaign): void {
  const { data } = store();
  const v: CampaignInput = campaign ?? {
    name: '', clientId: null, platform: 'Meta Ads', objective: 'Mensagens', startDate: today(), endDate: null,
    budget: null, spent: null, reach: null, clicks: null, results: null, learnings: '',
  };
  openModal({
    title: campaign ? 'Editar campanha' : 'Nova campanha',
    description: 'Os resultados são anotados à mão, olhando o Gerenciador de Anúncios. Nada é conectado à Meta.',
    size: 'lg',
    body: html`
      <form class="form" data-form="campaign:save" data-id="${campaign?.id ?? ''}">
        ${textField({ name: 'name', label: 'Nome da campanha', value: v.name, required: true, autofocus: true, placeholder: 'Ex.: Mensagens – sites para barbearias' })}
        <div class="form-grid">
          ${selectField({ name: 'clientId', label: 'De quem é', value: v.clientId ?? '', options: [{ value: '', label: 'MaweCreate' }, ...data.clients.map((c) => ({ value: c.id, label: c.company }))] })}
          ${selectField({ name: 'objective', label: 'Objetivo', value: v.objective, options: [...new Set([...CAMPAIGN_OBJECTIVES, v.objective])].map((o) => ({ value: o, label: o })) })}
          ${textField({ name: 'startDate', label: 'Início', type: 'date', value: v.startDate, required: true })}
          ${textField({ name: 'endDate', label: 'Fim', type: 'date', value: v.endDate ?? '' })}
          ${textField({ name: 'budget', label: 'Verba total (R$)', value: numberText(v.budget), inputmode: 'decimal' })}
          ${textField({ name: 'platform', label: 'Plataforma', value: v.platform, placeholder: 'Meta Ads' })}
        </div>
        <fieldset class="field results-fieldset">
          <legend class="field__label">Resultados (anote quando conferir)</legend>
          <div class="form-grid form-grid--4">
            ${textField({ name: 'spent', label: 'Valor gasto (R$)', value: numberText(v.spent), inputmode: 'decimal' })}
            ${textField({ name: 'reach', label: 'Alcance', value: numberText(v.reach), inputmode: 'numeric' })}
            ${textField({ name: 'clicks', label: 'Cliques', value: numberText(v.clicks), inputmode: 'numeric' })}
            ${textField({ name: 'results', label: 'Mensagens / contatos', value: numberText(v.results), inputmode: 'numeric', hint: 'Ou o resultado do objetivo.' })}
          </div>
          <p class="field__hint">O custo por resultado é calculado sozinho (gasto ÷ resultados).</p>
        </fieldset>
        ${textareaField({ name: 'learnings', label: 'O que testamos e aprendemos', value: v.learnings, rows: 3, placeholder: 'Ex.: criativo em vídeo deu mais resultado que imagem' })}
        ${formActions(campaign ? 'Salvar campanha' : 'Cadastrar campanha', campaign ? button({ label: 'Excluir', action: 'campaign:delete', variant: 'ghost', icon: 'trash', data: { id: campaign.id } }) : undefined)}
      </form>
    `,
  });
}

function optionalNumber(text: string, label: string): number | null {
  if (!text) return null;
  const value = parseMoney(text);
  if (value === null) throw new Error(`${label}: número inválido.`);
  return value;
}

registerForms({
  'campaign:save': async (form, values) => {
    requirePermission('finance:edit');
    const input: CampaignInput = {
      name: values.text('name'),
      clientId: values.optional('clientId'),
      platform: values.text('platform') || 'Meta Ads',
      objective: values.text('objective'),
      startDate: values.text('startDate'),
      endDate: values.optional('endDate'),
      budget: optionalNumber(values.text('budget'), 'Verba'),
      spent: optionalNumber(values.text('spent'), 'Valor gasto'),
      reach: optionalNumber(values.text('reach'), 'Alcance'),
      clicks: optionalNumber(values.text('clicks'), 'Cliques'),
      results: optionalNumber(values.text('results'), 'Resultados'),
      learnings: values.text('learnings'),
    };
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) => saveCampaign(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Campanha atualizada.' : 'Campanha cadastrada.');
  },
});

registerActions({
  'campaign:new': () => openCampaignForm(),
  'campaign:edit': (el) => {
    const c = store().data.campaigns.find((x) => x.id === el.dataset.id);
    if (c) openCampaignForm(c);
  },
  'campaign:delete': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Excluir campanha', text: 'A campanha e as anotações dela serão apagadas.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteCampaign(draft, el.dataset.id!));
    toast('Campanha excluída.');
  },
  'traffic:prev': () => {
    ui.month = shiftMonth(ui.month ?? monthKey(today()), -1);
    rerender();
  },
  'traffic:next': () => {
    ui.month = shiftMonth(ui.month ?? monthKey(today()), 1);
    rerender();
  },
  'traffic:owner': (el) => {
    ui.owner = el.dataset.value as typeof ui.owner;
    rerender();
  },
});

function metric(label: string, value: string): SafeHtml {
  return html`<div class="metric"><span>${label}</span><strong>${value || '—'}</strong></div>`;
}

function campaignCard(data: AppData, c: Campaign): SafeHtml {
  const t = today();
  const state = campaignState(c, t);
  const cpr = costPerResult(c);
  const used = c.budget && c.spent !== null ? Math.min(100, (c.spent / c.budget) * 100) : null;
  return html`<article class="campaign">
    <header class="campaign__head">
      <div>
        <button type="button" class="campaign__name" data-action="campaign:edit" data-id="${c.id}">${c.name}</button>
        <span class="campaign__sub">${ownerName(data, c)} · ${c.platform} · ${c.objective} ${demoTag(c)}</span>
      </div>
      ${badge(STATE_LABEL[state][0], STATE_LABEL[state][1])}
    </header>
    <p class="campaign__dates">${formatShortDate(c.startDate)} → ${c.endDate ? formatShortDate(c.endDate) : 'sem data de fim'}${c.budget !== null ? ` · verba ${formatCurrency(c.budget, true)}` : ''}</p>
    ${used !== null ? html`<div class="progress" role="progressbar" aria-valuenow="${Math.round(used)}" aria-valuemin="0" aria-valuemax="100" aria-label="Verba usada"><span class="progress__bar" style="width:${used}%"></span></div>` : ''}
    <div class="metrics">
      ${metric('Gasto', c.spent !== null ? formatCurrency(c.spent, true) : '')}
      ${metric('Alcance', c.reach !== null ? nf.format(c.reach) : '')}
      ${metric('Cliques', c.clicks !== null ? nf.format(c.clicks) : '')}
      ${metric('Resultados', c.results !== null ? nf.format(c.results) : '')}
      ${metric('Custo por resultado', cpr !== null ? formatCurrency(cpr, true) : '')}
    </div>
    ${c.learnings ? html`<div class="campaign__learn"><strong>Aprendizado</strong><p>${multiline(c.learnings)}</p></div>` : ''}
  </article>`;
}

export const trafficView: View = {
  title: () => 'Tráfego pago',
  render: () => {
    const { data } = store();
    const t = today();
    const month = ui.month ?? monthKey(t);
    const finance = allowed('finance:view');
    const filter = (c: Campaign) => (ui.owner === 'todos' ? true : ui.owner === 'mawe' ? c.clientId === null : c.clientId !== null);
    const inMonth = campaignsInMonth(data, month, t).filter(filter);
    const spend = monthAdSpend({ ...data, campaigns: data.campaigns.filter(filter) }, month, t);
    const results = inMonth.reduce((sum, c) => sum + (c.results ?? 0), 0);
    const spentAll = inMonth.reduce((sum, c) => sum + (c.spent ?? 0), 0);
    const running = data.campaigns.filter((c) => filter(c) && campaignState(c, t) === 'ativa').length;
    const learnings = data.campaigns.filter((c) => filter(c) && c.learnings).sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 6);

    return html`
      ${pageHeader({
        title: 'Tráfego pago',
        subtitle: `${pluralize(running, 'campanha rodando', 'campanhas rodando')} · resultados anotados manualmente`,
        actions: allowed('finance:edit') ? button({ label: 'Nova campanha', action: 'campaign:new', variant: 'primary', icon: 'plus' }) : undefined,
      })}
      <div class="toolbar">
        <div class="period-nav">
          ${button({ label: 'Mês anterior', iconOnly: true, icon: 'arrowLeft', action: 'traffic:prev' })}
          <strong class="period-nav__label">${monthLabel(month)}</strong>
          ${button({ label: 'Próximo mês', iconOnly: true, icon: 'arrowRight', action: 'traffic:next' })}
        </div>
        ${segmented({ label: 'De quem', action: 'traffic:owner', value: ui.owner, items: [{ value: 'todos', label: 'Todas' }, { value: 'mawe', label: 'MaweCreate' }, { value: 'clientes', label: 'Clientes' }] })}
      </div>
      <div class="stats">
        ${finance ? statCard({ label: 'Investido no mês', value: formatCurrency(spend, true), hint: 'Gasto de cada campanha dividido pelos dias em que rodou', tone: 'warning' }) : ''}
        ${statCard({ label: 'Campanhas no mês', value: String(inMonth.length) })}
        ${statCard({ label: 'Resultados', value: nf.format(results), hint: 'Mensagens, seguidores, cliques...' })}
        ${finance ? statCard({ label: 'Custo médio por resultado', value: results ? formatCurrency(spentAll / results, true) : '—' }) : ''}
      </div>
      ${inMonth.length
        ? html`<div class="campaign-grid">${inMonth.map((c) => campaignCard(data, c))}</div>`
        : html`<div class="panel">${emptyState({
            icon: 'megaphone',
            title: data.campaigns.length ? 'Nenhuma campanha neste mês' : 'Nenhuma campanha cadastrada',
            text: 'Registre cada campanha do Gerenciador de Anúncios para comparar resultados e lembrar o que funcionou.',
            action: allowed('finance:edit') ? button({ label: 'Nova campanha', action: 'campaign:new', variant: 'primary', icon: 'plus' }) : undefined,
          })}</div>`}
      ${learnings.length
        ? html`<section class="panel learnings">
            <header class="panel__header"><h2 class="panel__title">O que já aprendemos</h2></header>
            <div class="panel__body"><ul class="${cx('learning-list')}">${learnings.map((c) => html`<li><p>${multiline(c.learnings)}</p><small>${c.name} · ${formatShortDate(c.startDate)}</small></li>`)}</ul></div>
          </section>`
        : ''}
    `;
  },
};
