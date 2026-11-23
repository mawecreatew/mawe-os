/**
 * Treinamento: a trilha dos processos da agência para quem está aprendendo.
 * Cada pessoa marca "li" e "já fiz sozinho" no próprio progresso; os sócios
 * acompanham o de todo mundo.
 */
import { formatShortDate } from '../core/dates.ts';
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import type { Route } from '../core/router.ts';
import { assignableUsers } from '../domain/people.ts';
import { orderedProcesses } from '../domain/processes.ts';
import { toggleTraining, trainingOf, trainingStatus } from '../domain/workspace.ts';
import { store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, emptyState, pageHeader, panel, progressBar } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { openModal } from '../ui/overlay.ts';
import { processSteps } from './processes.ts';

function render(route: Route): SafeHtml {
  const { data, currentUser } = store();
  const people = assignableUsers(data);
  const who = people.find((u) => u.id === route.params[0]) ?? currentUser;
  const mine = who.id === currentUser.id;
  const processes = orderedProcesses(data);
  const areas = [...new Set(processes.map((p) => p.area))];
  return html`
    ${pageHeader({ title: 'Treinamento', subtitle: 'A trilha para aprender o jeito Mawe de trabalhar: leia cada processo e marque quando já fizer sozinho.' })}
    <div class="training-people">
      ${people.map((u) => {
        const s = trainingStatus(data, u.id);
        return html`<a class="${cx('training-person', u.id === who.id && 'is-active')}" href="#/treinamento/${u.id}">
          ${avatar(u, 'md')}
          <span class="training-person__main">
            <strong>${u.shortName}${u.id === currentUser.id ? ' (você)' : ''}</strong>
            ${progressBar(s.total ? (s.solo / s.total) * 100 : 0, `Treinamento de ${u.shortName}`)}
            <small>${s.read} de ${s.total} lidos · ${s.solo} feitos sozinho</small>
          </span>
        </a>`;
      })}
    </div>
    ${!mine ? html`<p class="section-intro">${icon('info', 13)} Você está vendo o progresso de ${who.shortName}. Só a própria pessoa marca o que já aprendeu.</p>` : ''}
    ${processes.length
      ? areas.map((area) =>
          panel({
            title: area,
            icon: 'route',
            body: html`<ol class="training-list">${processes
              .filter((p) => p.area === area)
              .map((p) => {
                const t = trainingOf(data, who.id, p.id);
                return html`<li class="${cx('training-item', t.soloAt && 'is-solo', t.readAt && 'is-read')}">
                  <button type="button" class="training-item__title" data-action="training:open" data-id="${p.id}">${p.title}</button>
                  <small class="muted">${[p.owner, p.duration].filter(Boolean).join(' · ')}</small>
                  <span class="training-item__marks">
                    ${mine
                      ? html`<button type="button" class="${cx('chip-toggle', t.readAt && 'is-on')}" data-action="training:toggle" data-id="${p.id}" data-field="readAt" aria-pressed="${t.readAt ? 'true' : 'false'}">${icon('check', 13)} Li</button>
                        <button type="button" class="${cx('chip-toggle', t.soloAt && 'is-on')}" data-action="training:toggle" data-id="${p.id}" data-field="soloAt" aria-pressed="${t.soloAt ? 'true' : 'false'}">${icon('check', 13)} Já fiz sozinho</button>`
                      : html`<span class="muted small">${t.soloAt ? `Fez sozinho em ${formatShortDate(t.soloAt.slice(0, 10))}` : t.readAt ? `Leu em ${formatShortDate(t.readAt.slice(0, 10))}` : 'Ainda não começou'}</span>`}
                  </span>
                </li>`;
              })}</ol>`,
          }),
        )
      : html`<div class="panel">${emptyState({ icon: 'route', title: 'Nenhum processo no manual', text: 'Escreva os processos em Agência › Processos e eles viram a trilha de treinamento.' })}</div>`}
  `;
}

export const trainingView: View = { title: () => 'Treinamento', render };

registerActions({
  'training:toggle': async (el) => {
    await store().apply((draft, ctx) => toggleTraining(draft, el.dataset.id!, el.dataset.field as 'readAt' | 'soloAt', ctx));
  },
  'training:open': (el) => {
    const step = (store().data.processes ?? []).find((p) => p.id === el.dataset.id);
    if (!step) return;
    openModal({
      title: step.title,
      description: [step.area, step.goal].filter(Boolean).join(' · '),
      body: html`${processSteps(step)}<p class="muted small">${icon('info', 13)} Marque "Li" e "Já fiz sozinho" na lista do Treinamento.</p>`,
    });
  },
});
