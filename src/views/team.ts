/** Equipe: quem faz parte, o papel de cada um, o que cada pessoa fez e como dar acesso a alguém novo. */
import { formatTimestamp, monthKey } from '../core/dates.ts';
import { registerActions } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { recentActivity } from '../domain/activity.ts';
import { sentContacts } from '../domain/commercial.ts';
import { isOpenStage } from '../domain/labels.ts';
import { grantAccess, setRole } from '../domain/people.ts';
import { ROLE_LABELS } from '../domain/permissions.ts';
import type { Role } from '../domain/types.ts';
import { allowed, auth, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, badge, button, emptyState, notice, pageHeader, panel, segmented } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { confirmAction, toast } from '../ui/overlay.ts';

const ui = { person: 'todos' };

registerActions({
  'team:person': (el) => {
    ui.person = el.dataset.value!;
    rerender();
  },
  'team:role': async (el) => {
    requirePermission('system:manage');
    const role = (el as HTMLSelectElement).value as Role;
    await store().apply((draft, ctx) => setRole(draft, el.dataset.id!, role, ctx.userId));
    toast(`Papel alterado para ${ROLE_LABELS[role]}.`);
  },
  'team:grant': async (el) => {
    requirePermission('system:manage');
    const user = store().data.users.find((u) => u.id === el.dataset.id);
    if (!user) return;
    const ok = await confirmAction({
      title: `Dar acesso para ${user.name}`,
      text: 'A pessoa vira colaborador(a): vê comercial, projetos, tarefas e biblioteca, mas não o financeiro. Depois é preciso criar a conta de login dela no Supabase (o passo a passo aparece nesta tela).',
      confirmLabel: 'Dar acesso',
    });
    if (!ok) return;
    await store().apply((draft) => grantAccess(draft, user.id));
    toast(`${user.name} agora é colaborador(a).`);
  },
});

function personStats(userId: string): SafeHtml {
  const { data } = store();
  const t = today();
  const month = monthKey(t);
  const leads = data.opportunities.filter((o) => o.ownerIds.includes(userId) && isOpenStage(o.stage)).length;
  const contacts = data.opportunities.reduce((sum, o) => sum + (o.contactLog ?? []).filter((c) => c.authorId === userId && c.date.startsWith(month) && c.direction === 'enviado').length, 0);
  const legacy = data.opportunities.filter((o) => o.ownerIds.includes(userId) && !(o.contactLog ?? []).length && sentContacts(o).some((c) => c.date.startsWith(month))).length;
  const openTasks = data.tasks.filter((x) => x.assigneeIds.includes(userId) && x.status !== 'concluida').length;
  const lateTasks = data.tasks.filter((x) => x.assigneeIds.includes(userId) && x.status !== 'concluida' && x.dueDate && x.dueDate < t).length;
  const done = data.tasks.filter((x) => x.assigneeIds.includes(userId) && x.completedAt?.startsWith(month)).length;
  return html`<dl class="team-stats">
    <div><dt>Leads</dt><dd>${leads}</dd></div>
    <div><dt>Contatos no mês</dt><dd>${contacts + legacy}</dd></div>
    <div><dt>Tarefas abertas</dt><dd class="${cx(lateTasks && 'text-danger')}">${openTasks}${lateTasks ? html` <small>(${lateTasks} atrasadas)</small>` : ''}</dd></div>
    <div><dt>Concluídas no mês</dt><dd>${done}</dd></div>
  </dl>`;
}

export const teamView: View = {
  title: () => 'Equipe',
  render: () => {
    const { data, currentUser } = store();
    const manage = allowed('system:manage');
    const members = data.users.filter((u) => !u.guest);
    const guests = data.users.filter((u) => u.guest);
    const pendingLogin = members.filter((u) => u.role === 'colaborador');
    const items = recentActivity(data, 60, ui.person === 'todos' ? undefined : ui.person);
    return html`
      ${pageHeader({ title: 'Equipe', subtitle: 'Quem faz parte da MaweCreate, o que cada pessoa pode ver e o que foi feito no sistema.' })}

      <div class="team-grid">
        ${members.map(
          (u) => html`<article class="team-card">
            <header class="team-card__head">
              ${avatar(u, 'md')}
              <div><strong>${u.name}</strong><small>${u.title}${u.id === currentUser.id ? ' · você' : ''}</small></div>
              ${manage && u.id !== currentUser.id
                ? html`<select class="input select select--inline" aria-label="Papel de ${u.name}" data-change="team:role" data-id="${u.id}">
                    ${(Object.keys(ROLE_LABELS) as Role[]).map((r) => html`<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`)}
                  </select>`
                : badge(ROLE_LABELS[u.role], u.role === 'socio' ? 'accent' : 'info')}
            </header>
            ${personStats(u.id)}
          </article>`,
        )}
      </div>

      <div class="detail-grid">
        <div class="detail-grid__main">
          ${panel({
            title: 'Atividade',
            icon: 'activity',
            action: segmented({ label: 'Pessoa', action: 'team:person', value: ui.person, items: [{ value: 'todos', label: 'Todos' }, ...members.map((u) => ({ value: u.id, label: u.shortName.split(' ')[0] }))] }),
            body: items.length
              ? html`<ul class="activity activity--full">${items.map((a) => {
                  const user = data.users.find((u) => u.id === a.userId);
                  return html`<li class="activity__item">
                    ${avatar(user)}
                    <span><strong>${user?.shortName.split(' ')[0] ?? 'Alguém'}</strong> ${a.href ? html`<a href="${a.href}">${a.text}</a>` : a.text}</span>
                    <small>${formatTimestamp(a.at)}</small>
                  </li>`;
                })}</ul>`
              : emptyState({ icon: 'activity', compact: true, title: 'Nada registrado ainda', text: 'A partir de agora, contatos, clientes novos, mudanças de etapa e pagamentos ficam anotados aqui.' }),
          })}
        </div>
        <aside class="detail-grid__side">
          ${panel({
            title: 'O que cada papel vê',
            icon: 'lock',
            body: html`<ul class="bullet-list">
                <li><strong>Sócio(a):</strong> tudo, inclusive financeiro, preços e configurações.</li>
                <li><strong>Colaborador(a):</strong> comercial (sem valores), projetos, tarefas e biblioteca. Não vê o financeiro.</li>
                <li><strong>Pessoa extra:</strong> só recebe tarefas. Não entra no sistema.</li>
              </ul>
              <p class="muted small">${icon('info', 13)} Hoje essa separação é feita pelas telas. Antes de dar login para alguém de fora da sociedade, vale separar os dados financeiros no banco (está no guia técnico).</p>`,
          })}
          ${panel({
            title: 'Pessoas extras',
            icon: 'user',
            count: guests.length,
            body: guests.length
              ? html`<ul class="people">${guests.map(
                  (u) => html`<li class="people__item">${avatar(u, 'md')}<div><strong>${u.name}</strong><small>Recebe tarefas · sem login</small></div>
                    ${manage ? button({ label: 'Dar acesso', action: 'team:grant', size: 'sm', data: { id: u.id } }) : ''}</li>`,
                )}</ul>`
              : html`<p class="muted small">Cadastre freelancers e ajudantes em <a href="#/sistema">Sistema</a> ou direto no campo "Responsáveis" de uma tarefa.</p>`,
          })}
          ${pendingLogin.length && auth().mode === 'supabase'
            ? notice({
                title: 'Para a pessoa conseguir entrar',
                icon: 'info',
                text: html`Crie a conta dela no Supabase (Authentication → Users) e depois rode no SQL Editor, trocando o e-mail:<br />${pendingLogin.map(
                  (u) => html`<code class="code-line">insert into public.members (user_id, app_user_id, name, role) select id, '${u.id}', '${u.name}', 'colaborador' from auth.users where email = lower('EMAIL-DA-PESSOA');</code>`,
                )}`,
              })
            : ''}
          <p class="muted small">${pluralize(members.length, 'pessoa com login', 'pessoas com login')} · ${pluralize(guests.length, 'pessoa extra', 'pessoas extras')}</p>
        </aside>
      </div>
    `;
  },
};
