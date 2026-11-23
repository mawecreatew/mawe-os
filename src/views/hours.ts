/** Horas trabalhadas em cada projeto: cronômetro, registro manual e valor por hora. */
import { formatShortDate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency } from '../core/format.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { findUser } from '../domain/selectors.ts';
import type { Project } from '../domain/types.ts';
import { deleteTimeLog, formatMinutes, logTime, parseDuration, projectMinutes, projectValue, startTimer, stopTimer, valuePerHour } from '../domain/workspace.ts';
import { allowed, store, today } from '../app/context.ts';
import { button, panel } from '../ui/components.ts';
import { formActions, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';

export function renderHours(project: Project): SafeHtml {
  const { data, currentUser } = store();
  const timer = data.timers?.[currentUser.id];
  const running = timer?.projectId === project.id;
  const otherRunning = timer && !running;
  const minutes = projectMinutes(project);
  const perHour = valuePerHour(data, project);
  const value = projectValue(data, project);
  const logs = [...(project.timeLogs ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return panel({
    title: 'Horas trabalhadas',
    icon: 'clock',
    action: html`<span class="muted small">${formatMinutes(minutes)}</span>`,
    body: html`
      <div class="quick-actions">
        ${running
          ? button({ label: 'Parar cronômetro', action: 'hours:stop', variant: 'primary', icon: 'clock', size: 'sm' })
          : button({ label: 'Começar cronômetro', action: 'hours:start', icon: 'clock', size: 'sm', data: { project: project.id } })}
        ${button({ label: 'Anotar horas', action: 'hours:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { project: project.id } })}
      </div>
      ${running ? html`<p class="timer-note">${icon('clock', 13)} Cronômetro ligado desde ${new Date(timer!.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}
      ${otherRunning ? html`<p class="muted small">Você tem um cronômetro ligado em outro projeto.</p>` : ''}
      ${allowed('finance:view')
        ? html`<p class="hours-value">${perHour !== null
            ? html`Rendeu <strong>${formatCurrency(perHour, true)} por hora</strong> (${formatCurrency(value!, true)} ÷ ${formatMinutes(minutes)})`
            : value
              ? html`Valor do projeto: ${formatCurrency(value, true)}. Anote as horas para ver quanto rendeu por hora.`
              : 'Ligue o projeto a uma proposta aceita (ou informe o valor) para ver quanto rendeu por hora.'}</p>`
        : ''}
      ${logs.length
        ? html`<ul class="hours-list">${logs.map(
            (l) => html`<li><span>${formatShortDate(l.date)} · ${findUser(data, l.userId)?.shortName.split(' ')[0] ?? ''}${l.note ? ` · ${l.note}` : ''}</span><strong>${formatMinutes(l.minutes)}</strong>
              ${l.userId === currentUser.id ? button({ label: 'Apagar registro', iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'hours:delete', data: { project: project.id, id: l.id } }) : ''}</li>`,
          )}</ul>`
        : html`<p class="muted small">Nenhuma hora anotada ainda.</p>`}
    `,
  });
}

registerForms({
  'hours:save': async (form, values) => {
    const minutes = parseDuration(values.text('duration'));
    await store().apply((draft, ctx) => logTime(draft, form.dataset.project!, { date: values.text('date') || today(), minutes, note: values.text('note') }, ctx));
    closeModal();
    toast(`${formatMinutes(minutes)} anotadas.`);
  },
});

registerActions({
  'hours:start': async (el) => {
    await store().apply((draft, ctx) => startTimer(draft, el.dataset.project!, ctx));
    toast('Cronômetro ligado. Pode fechar a tela, ele continua contando.');
  },
  'hours:stop': async () => {
    const log = await store().apply((draft, ctx) => stopTimer(draft, ctx));
    if (log) toast(`${formatMinutes(log.minutes)} anotadas no projeto.`);
  },
  'hours:new': (el) => {
    openModal({
      title: 'Anotar horas',
      body: html`<form class="form" data-form="hours:save" data-project="${el.dataset.project!}">
        <div class="form-grid">
          ${textField({ name: 'duration', label: 'Tempo', required: true, autofocus: true, placeholder: '1h30, 1:30 ou 90 min' })}
          ${textField({ name: 'date', label: 'Dia', type: 'date', value: today() })}
        </div>
        ${textField({ name: 'note', label: 'O que fez (opcional)', placeholder: 'Ex.: montei a página de cardápio' })}
        ${formActions('Anotar')}
      </form>`,
    });
  },
  'hours:delete': async (el) => {
    await store().apply((draft) => deleteTimeLog(draft, el.dataset.project!, el.dataset.id!));
  },
});

