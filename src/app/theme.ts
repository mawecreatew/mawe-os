/**
 * Cores do sistema. Cada pessoa escolhe a sua (fica salvo só neste
 * navegador). As cores de cada tema estão em `styles/tokens.css`.
 */
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { openModal, toast } from '../ui/overlay.ts';

export interface ThemeOption {
  id: string;
  label: string;
  description: string;
  /** Cor do menu (vai na barra do navegador do celular). */
  menu: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'mawe', label: 'Mawe', description: 'Creme e marrom, o padrão da marca', menu: '#2a211c' },
  { id: 'vinho', label: 'Vinho', description: 'Bordô e creme', menu: '#4a1621' },
  { id: 'oliva', label: 'Oliva', description: 'Verde oliva e linho', menu: '#2c3520' },
  { id: 'rose', label: 'Rosé', description: 'Rosa queimado e ameixa', menu: '#43202f' },
  { id: 'mar', label: 'Mar', description: 'Azul petróleo e areia', menu: '#1d3036' },
  { id: 'noite', label: 'Noite', description: 'Escuro, em tons de café', menu: '#0f0b08' },
  { id: 'grafite', label: 'Grafite', description: 'Escuro neutro', menu: '#0b0b0b' },
];

const KEY = 'mawe-os:tema';

export function currentTheme(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === saved) ? (saved as string) : 'mawe';
  } catch {
    return 'mawe';
  }
}

function apply(id: string): void {
  const root = document.documentElement;
  if (id === 'mawe') delete root.dataset.tema;
  else root.dataset.tema = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  const theme = THEMES.find((t) => t.id === id);
  if (meta && theme) meta.setAttribute('content', theme.menu);
}

/** Chamado na abertura do sistema, antes de desenhar a primeira tela. */
export function applySavedTheme(): void {
  apply(currentTheme());
}

export function setTheme(id: string): void {
  if (!THEMES.some((t) => t.id === id)) return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* navegador sem armazenamento: vale só até recarregar */
  }
  apply(id);
}

export function themePicker(): SafeHtml {
  const active = currentTheme();
  return html`<div class="themes" role="radiogroup" aria-label="Cores do sistema">
    ${THEMES.map(
      (t) => html`<button type="button" role="radio" aria-checked="${t.id === active ? 'true' : 'false'}" class="${cx('theme-card', t.id === active && 'is-active')}" data-action="theme:set" data-id="${t.id}">
        <span class="theme-card__swatch" aria-hidden="true">${['bg', 'menu', 'accent'].map((part) => html`<i style="background: var(--sample-${t.id}-${part})"></i>`)}</span>
        <span class="theme-card__label">${t.label}</span>
        <span class="theme-card__desc">${t.description}</span>
      </button>`,
    )}
  </div>`;
}

registerActions({
  'theme:open': () => {
    document.body.classList.remove('nav-open');
    openModal({ title: 'Cores do sistema', description: 'Cada pessoa escolhe a sua. Fica salvo só neste navegador.', body: themePicker() });
  },
  'theme:set': (el) => {
    setTheme(el.dataset.id!);
    document.querySelectorAll<HTMLElement>('.theme-card').forEach((card) => {
      const on = card.dataset.id === el.dataset.id;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    toast(`Tema ${THEMES.find((t) => t.id === el.dataset.id)?.label ?? ''} aplicado.`);
  },
});
