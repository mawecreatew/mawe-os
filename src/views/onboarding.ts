/** Onboarding: os clientes que acabaram de fechar e o que falta para o projeto começar. */
import { html, type SafeHtml } from '../core/html.ts';
import { pluralize } from '../core/format.ts';
import { briefingQuestions, inOnboarding, onboardingProgress } from '../domain/clientcare.ts';
import { store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, emptyState, pageHeader, panel, progressBar } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { onboardingChecklist } from './client-tabs.ts';

function render(): SafeHtml {
  const { data } = store();
  const list = data.clients.filter((c) => inOnboarding(data, c)).sort((a, b) => onboardingProgress(a).done - onboardingProgress(b).done || a.company.localeCompare(b.company, 'pt-BR'));
  const total = briefingQuestions(data).length;
  return html`
    ${pageHeader({
      title: 'Onboarding',
      subtitle: list.length ? `${pluralize(list.length, 'cliente começando', 'clientes começando')}` : 'Começo de cada projeto: contrato, entrada, briefing e materiais.',
      actions: button({ label: 'Copiar perguntas do briefing', action: 'briefing:copy', icon: 'copy' }),
    })}
    <p class="section-intro">Quando um cliente fecha, o projeto só começa de verdade quando tudo abaixo estiver marcado. Assim ninguém fica parado esperando logo, foto ou pagamento.</p>
    ${list.length
      ? html`<div class="onboarding-grid">${list.map((c) => {
          const p = onboardingProgress(c);
          const answered = Object.keys(c.briefing?.answers ?? {}).length;
          return panel({
            title: c.company,
            icon: 'clients',
            action: html`<a class="panel__link" href="#/clientes/${c.id}/onboarding">Abrir ${icon('arrowRight', 14)}</a>`,
            body: html`
              ${progressBar((p.done / p.total) * 100, `Onboarding de ${c.company}`)}
              <p class="muted small">${p.done} de ${p.total} passos · briefing: ${answered} de ${total} respostas · <a href="#/clientes/${c.id}/briefing">preencher</a> · <a href="#/clientes/${c.id}/arquivos">arquivos</a></p>
              ${onboardingChecklist(c)}
            `,
          });
        })}</div>`
      : html`<div class="panel">${emptyState({ icon: 'check', title: 'Nenhum cliente em onboarding', text: 'Quando um cliente novo fechar, ele aparece aqui com o checklist do começo do projeto.' })}</div>`}
  `;
}

export const onboardingView: View = { title: () => 'Onboarding', render };
