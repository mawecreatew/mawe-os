/** Tela de login e telas de aviso exibidas antes de o sistema abrir. */
import { registerActions, registerForms } from '../core/events.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { BRAND } from '../config/brand.ts';
import type { SupabaseClient } from '../integrations/supabase/client.ts';
import { icon } from '../ui/icons.ts';
import { brandAssets } from './context.ts';

let pendingClient: SupabaseClient | null = null;

function brandHeader(): SafeHtml {
  return html`
    <div class="auth-card__brand">
      ${brandAssets.logoHorizontal
        ? html`<img class="auth-card__logo" src="${brandAssets.logoHorizontal}" alt="${BRAND.agencyName}" />`
        : html`<span class="auth-card__name">${BRAND.agencyName}</span>`}
      <span class="brand__product">${BRAND.productName}</span>
    </div>
  `;
}

function mount(content: SafeHtml): void {
  document.body.classList.add('auth-screen');
  const view = document.getElementById('view')!;
  view.innerHTML = html`<div class="auth-wrap"><section class="auth-card">${brandHeader()}${content}</section></div>`.value;
  document.title = `Entrar · ${BRAND.productName}`;
  document.body.classList.remove('is-loading');
}

export function showLogin(client: SupabaseClient, message?: { text: string; tone: 'error' | 'info' }): void {
  pendingClient = client;
  mount(html`
    <h1 class="auth-card__title">Entrar</h1>
    <p class="auth-card__text">Use o e-mail e a senha da sua conta do Mawe OS.</p>
    ${message ? html`<p class="auth-message auth-message--${message.tone}" role="alert">${icon(message.tone === 'error' ? 'alert' : 'info', 16)} ${message.text}</p>` : ''}
    <form class="form" data-form="auth:login" novalidate>
      <div class="field">
        <label class="field__label" for="login-email">E-mail</label>
        <input class="input" id="login-email" name="email" type="email" autocomplete="username" required autofocus />
      </div>
      <div class="field">
        <label class="field__label" for="login-password">Senha</label>
        <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <button type="submit" class="btn btn--primary btn--block">Entrar</button>
    </form>
    <p class="auth-card__foot">Esqueceu a senha? O outro sócio pode redefini-la no painel do Supabase (veja docs/SUPABASE.md).</p>
  `);
  document.getElementById('login-email')?.focus();
}

/** Tela de aviso que impede o uso do sistema (configuração, acesso ou conexão). */
export function showBlockingMessage(options: { title: string; text: string; canSignOut?: boolean; canRetry?: boolean }): void {
  mount(html`
    <h1 class="auth-card__title">${options.title}</h1>
    <p class="auth-card__text">${options.text}</p>
    <div class="button-row">
      ${options.canRetry ? html`<button type="button" class="btn btn--primary" data-action="auth:retry">Tentar novamente</button>` : ''}
      ${options.canSignOut ? html`<button type="button" class="btn btn--secondary" data-action="auth:logout">Sair</button>` : ''}
    </div>
  `);
}

registerForms({
  'auth:login': async (form, values) => {
    if (!pendingClient) return;
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true;
    button.textContent = 'Entrando…';
    try {
      await pendingClient.signIn(values.text('email'), values.text('password'));
      window.location.reload();
    } catch (error) {
      showLogin(pendingClient, { text: error instanceof Error ? error.message : 'Não foi possível entrar.', tone: 'error' });
      const email = document.getElementById('login-email') as HTMLInputElement | null;
      if (email) email.value = values.text('email');
      document.getElementById('login-password')?.focus();
    }
  },
});

registerActions({
  'auth:retry': () => window.location.reload(),
});
