/** Painel › o dia da equipe: 3 prioridades de cada pessoa e o alinhamento da noite. */
import { formatTimestamp } from '../core/dates.ts';
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { MAX_PRIORITIES, PRIORITIES_PER_DAY, addPrioritySlot, dayOf, prioritiesOf, removePrioritySlot, setAlignment, setPriority, toggleAlignmentDone, togglePriority, yesterdayPlan, type AlignmentField } from '../domain/daily.ts';
import { teamMembers } from '../domain/people.ts';
import { store, today } from '../app/context.ts';
import { button, panel } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/overlay.ts';

const PLACEHOLDERS = ['O que mais gera receita hoje?', 'Um passo de um projeto', 'Uma tarefa da agência'];

export function renderPriorities(): SafeHtml {
  const { data, currentUser } = store();
  const t = today();
  const mine = prioritiesOf(data, t, currentUser.id);
  const others = teamMembers(data).filter((u) => u.id !== currentUser.id);
  const plan = yesterdayPlan(data, t);
  const done = mine.filter((p) => p.text && p.done).length;
  return panel({
    title: '3 prioridades de hoje',
    icon: 'flag',
    className: 'day-panel',
    action: html`<span class="muted small">${done} de ${mine.filter((p) => p.text).length || 3} feitas</span>`,
    body: html`
      ${plan ? html`<p class="day-plan">${icon('info', 14)} <span>No alinhamento de ontem vocês combinaram: <strong>${plan}</strong></span></p>` : ''}
      <ol class="prios">
        ${mine.map(
          (p, i) => html`<li class="${cx('prio', p.done && 'is-done')}">
            <span class="prio__n">${i + 1}</span>
            <label class="visually-hidden" for="prio-${i}">Prioridade ${i + 1}</label>
            <input class="prio__input" id="prio-${i}" value="${p.text}" placeholder="${PLACEHOLDERS[i] ?? 'Mais uma prioridade'}" data-change="day:priority" data-index="${i}" autocomplete="off" />
            <input type="checkbox" class="check" ${p.done ? 'checked' : ''} ${p.text ? '' : 'disabled'} data-change="day:toggle" data-index="${i}" aria-label="Concluir prioridade ${i + 1}" />
            ${i >= PRIORITIES_PER_DAY ? button({ label: `Tirar a prioridade ${i + 1}`, iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'day:remove', data: { index: String(i) } }) : ''}
          </li>`,
        )}
      </ol>
      ${mine.length < MAX_PRIORITIES ? html`<button type="button" class="prio-add" data-action="day:add">${icon('plus', 14)} Mais uma prioridade</button>` : ''}
      ${others.map((u) => {
        const list = prioritiesOf(data, t, u.id).filter((p) => p.text);
        return html`<div class="prios-other">
          <span class="prios-other__who">${u.shortName.split(' ')[0]}</span>
          ${list.length
            ? html`<ul>${list.map((p) => html`<li class="${cx(p.done && 'is-done')}">${p.done ? icon('check', 13) : ''}${p.text}</li>`)}</ul>`
            : html`<span class="muted small">Ainda não escreveu as prioridades de hoje.</span>`}
        </div>`;
      })}
    `,
  });
}

export function renderAlignment(): SafeHtml {
  const { data } = store();
  const a = dayOf(data, today()).alignment;
  const field = (name: AlignmentField, label: string, placeholder: string) => html`<div class="field">
    <label class="field__label" for="align-${name}">${label}</label>
    <textarea class="input textarea" id="align-${name}" rows="2" placeholder="${placeholder}" data-change="day:align" data-field="${name}">${a[name]}</textarea>
  </div>`;
  return panel({
    title: 'Alinhamento da noite',
    icon: 'chat',
    className: cx('align-panel', a.doneAt && 'is-done'),
    action: a.doneAt ? html`<span class="status-pill">${icon('check', 13)} Feito</span>` : html`<span class="muted small">20 minutos</span>`,
    body: html`
      ${field('happened', 'O que aconteceu hoje', 'Clientes, entregas, contatos...')}
      ${field('blocked', 'O que travou', 'O que precisa de ajuda ou decisão')}
      ${field('tomorrow', 'O que fazer amanhã', 'Aparece amanhã no topo das prioridades')}
      <div class="align-panel__foot">
        ${button({ label: a.doneAt ? 'Desmarcar' : 'Alinhamento feito', action: 'day:align-done', icon: a.doneAt ? undefined : 'check', size: 'sm', variant: a.doneAt ? 'ghost' : 'secondary' })}
        ${a.doneAt ? html`<small class="muted">em ${formatTimestamp(a.doneAt)}</small>` : html`<small class="muted">Salva sozinho ao sair de cada campo.</small>`}
      </div>
    `,
  });
}


registerActions({
  'day:priority': async (el) => {
    const input = el as HTMLInputElement;
    await store().apply((draft, ctx) => setPriority(draft, today(), Number(input.dataset.index), input.value, ctx));
  },
  'day:add': async () => {
    await store().apply((draft, ctx) => addPrioritySlot(draft, today(), ctx));
    window.setTimeout(() => document.querySelectorAll<HTMLInputElement>('.prio__input').forEach((input, i, all) => i === all.length - 1 && input.focus()), 0);
  },
  'day:remove': async (el) => {
    await store().apply((draft, ctx) => removePrioritySlot(draft, today(), Number(el.dataset.index), ctx));
  },
  'day:toggle': async (el) => {
    await store().apply((draft, ctx) => togglePriority(draft, today(), Number(el.dataset.index), ctx));
  },
  'day:align': async (el) => {
    const input = el as HTMLTextAreaElement;
    await store().apply((draft) => setAlignment(draft, today(), input.dataset.field as AlignmentField, input.value));
  },
  'day:align-done': async () => {
    await store().apply((draft, ctx) => toggleAlignmentDone(draft, today(), ctx));
    if (dayOf(store().data, today()).alignment.doneAt) toast('Alinhamento registrado. Bom descanso!');
  },
});
