import type { Route } from '../core/router.ts';
import type { SafeHtml } from '../core/html.ts';

/** Uma tela do sistema. `render` devolve o HTML a partir do estado atual. */
export interface View {
  /** Título usado na aba do navegador. */
  title: (route: Route) => string;
  render: (route: Route) => SafeHtml;
}
