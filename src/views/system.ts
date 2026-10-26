/** Sistema: perfil, dados locais, estado das integrações e da marca. Tudo descrito com honestidade. */
import { registerActions } from '../core/events.ts';
import { formatTimestamp, todayISO } from '../core/dates.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { BRAND } from '../config/brand.ts';
import { aiProvider } from '../agents/provider.ts';
import { ROLE_LABELS } from '../domain/permissions.ts';
import { brandAssets, requirePermission, store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, badge, button, notice, pageHeader, panel } from '../ui/components.ts';
import { confirmAction, toast } from '../ui/overlay.ts';

registerActions({
  'system:reset-demo': async () => {
    requirePermission('system:manage');
    const ok = await confirmAction({ title: 'Restaurar demonstração', text: 'Todos os dados deste navegador serão substituídos pelos dados fictícios de demonstração.', confirmLabel: 'Restaurar' });
    if (!ok) return;
    await store().reset('demo');
    toast('Dados de demonstração restaurados.');
  },
  'system:reset-empty': async () => {
    requirePermission('system:manage');
    const ok = await confirmAction({ title: 'Começar com base vazia', text: 'Todos os dados deste navegador serão apagados (exceto os perfis dos sócios). Exporte uma cópia antes, se quiser guardar algo.', confirmLabel: 'Apagar e começar' });
    if (!ok) return;
    await store().reset('empty');
    toast('Base vazia criada. Os dados ficam somente neste navegador.');
  },
  'system:export': () => {
    const blob = new Blob([JSON.stringify(store().data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mawe-os-backup-${todayISO(store().now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Cópia dos dados baixada para este computador.');
  },
});

function integration(name: string, status: string, tone: 'neutral' | 'warning' | 'success', detail: string): SafeHtml {
  return html`<li class="integration">
    <div><strong>${name}</strong><p>${detail}</p></div>
    ${badge(status, tone)}
  </li>`;
}

export const systemView: View = {
  title: () => 'Sistema',
  render: () => {
    const { data, currentUser, source } = store();
    return html`
      ${pageHeader({ title: 'Sistema', subtitle: 'Estado real do protótipo: o que está ativo, onde os dados ficam e o que ainda falta integrar.' })}

      ${notice({
        tone: 'warning',
        icon: 'lock',
        title: 'Protótipo local, sem autenticação',
        text: 'A troca de perfil no menu serve apenas para visualizar o sistema como Maria Eduarda ou Wesley. Ela não protege nenhuma informação. Não registre dados sensíveis reais antes de configurar login e banco de dados.',
      })}

      <div class="detail-grid">
        <div class="detail-grid__main">
          ${panel({
            title: 'Integrações',
            icon: 'layers',
            body: html`<ul class="integrations">
              ${integration('Autenticação', 'Não configurada', 'warning', 'Contas separadas para cada sócio exigem um serviço de login real. A estrutura de perfis e permissões já está preparada.')}
              ${integration('Banco de dados compartilhado', 'Não configurado', 'warning', `Hoje os dados ficam em: ${source.label}. Cada navegador tem sua própria cópia — não há sincronização entre os sócios.`)}
              ${integration('Modelo de IA', aiProvider.connected ? 'Conectado' : 'Não conectado', aiProvider.connected ? 'success' : 'warning', 'Os agentes registram pedidos, mas não geram respostas. A integração deve passar por um servidor que guarde a chave de API.')}
              ${integration('GitHub', 'Não conectado', 'neutral', 'Os projetos guardam apenas o link do repositório. Nenhum acesso ao GitHub é feito.')}
              ${integration('Publicação na internet', 'Não publicado', 'neutral', 'O sistema roda somente neste computador (127.0.0.1).')}
            </ul>`,
          })}

          ${panel({
            title: 'Dados',
            icon: 'database',
            body: html`
              <dl class="info">
                <div class="info__item"><dt>Conjunto atual</dt><dd>${data.meta.dataset === 'demo' ? 'Demonstração (fictício)' : 'Base própria (local)'}</dd></div>
                <div class="info__item"><dt>Criado em</dt><dd>${formatTimestamp(data.meta.createdAt)}</dd></div>
                <div class="info__item"><dt>Armazenamento</dt><dd>${source.label}</dd></div>
                <div class="info__item"><dt>Versão do formato</dt><dd>${data.schemaVersion}</dd></div>
              </dl>
              <div class="button-row">
                ${button({ label: 'Baixar cópia (JSON)', action: 'system:export', icon: 'download' })}
                ${button({ label: 'Restaurar demonstração', action: 'system:reset-demo', icon: 'database' })}
                ${button({ label: 'Começar com base vazia', action: 'system:reset-empty', variant: 'danger', icon: 'trash' })}
              </div>
            `,
          })}
        </div>

        <aside class="detail-grid__side">
          ${panel({
            title: 'Perfis',
            icon: 'user',
            body: html`<ul class="people">
              ${data.users.map(
                (u) => html`<li class="people__item">${avatar(u, 'md')}<div><strong>${u.name}</strong><small>${ROLE_LABELS[u.role]}${u.id === currentUser.id ? ' · perfil ativo' : ''}</small></div></li>`,
              )}
            </ul>`,
          })}
          ${panel({
            title: 'Marca',
            icon: 'image',
            body: html`
              <dl class="info info--stack">
                <div class="info__item"><dt>Logo horizontal</dt><dd>${brandAssets.logoHorizontal ? badge('Encontrada', 'success') : badge('Não adicionada', 'warning')}</dd></div>
                <div class="info__item"><dt>Monograma</dt><dd>${brandAssets.monogram ? badge('Encontrado', 'success') : badge('Não adicionado', 'warning')}</dd></div>
              </dl>
              <p class="small muted">Salve os arquivos oficiais em <code>public/brand/</code> com os nomes indicados em <code>public/brand/LEIA-ME.md</code>. Enquanto isso, o menu mostra apenas o nome “${BRAND.agencyName}” em texto.</p>
            `,
          })}
        </aside>
      </div>
    `;
  },
};
