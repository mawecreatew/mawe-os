/**
 * Documentos com a marca da agência (proposta, contrato, manuais): prévia na
 * tela e impressão em "Salvar como PDF" do próprio navegador, sem bibliotecas.
 */
import { registerActions } from '../core/events.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { brandAssets, store } from '../app/context.ts';
import { agencyOf } from '../domain/daily.ts';
import { documentText, type AgencyDocument, type DocBlock } from '../domain/documents.ts';
import { button, notice } from './components.ts';
import { openModal, toast } from './overlay.ts';

function block(b: DocBlock): SafeHtml {
  switch (b.t) {
    case 'title':
      return html`<h1 class="doc__title">${b.text}</h1>`;
    case 'subtitle':
      return html`<p class="doc__subtitle">${b.text}</p>`;
    case 'heading':
      return html`<h2 class="doc__heading">${b.text}</h2>`;
    case 'paragraph':
      return html`<p class="doc__p">${b.text}</p>`;
    case 'list':
      return b.ordered
        ? html`<ol class="doc__list">${b.items.map((i) => html`<li>${i}</li>`)}</ol>`
        : html`<ul class="doc__list">${b.items.map((i) => html`<li>${i}</li>`)}</ul>`;
    case 'table':
      return html`<dl class="doc__table">${b.rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
    case 'total':
      return html`<p class="doc__total"><span>${b.label}</span><strong>${b.value}</strong></p>`;
    case 'note':
      return html`<p class="doc__note">${b.text}</p>`;
    case 'signatures':
      return html`<div class="doc__signatures">${b.names.map((n) => html`<div><span class="doc__sign-line"></span>${n}</div>`)}</div>`;
  }
}

/** A folha do documento (mesma marcação na prévia e na impressão). */
export function documentSheet(doc: AgencyDocument): SafeHtml {
  const a = agencyOf(store().data);
  const contact = [a.website, a.instagram, a.whatsapp].filter(Boolean).join('  ·  ');
  return html`<article class="doc">
    <header class="doc__band">
      ${brandAssets.logoHorizontal
        ? html`<img class="doc__logo" src="${brandAssets.logoHorizontal}" alt="${a.name}" />`
        : html`<span class="doc__brand">${a.name}</span>`}
      ${contact ? html`<span class="doc__contact">${contact}</span>` : ''}
    </header>
    <div class="doc__body">${doc.blocks.map(block)}</div>
  </article>`;
}

let current: AgencyDocument | null = null;

/**
 * Abre a prévia do documento com os botões de baixar e copiar.
 * `warning` aparece acima da folha (ex.: dados que faltam no contrato).
 */
export function openDocument(doc: AgencyDocument, options: { title: string; warning?: string; extraActions?: SafeHtml } = { title: 'Documento' }): void {
  current = doc;
  openModal({
    title: options.title,
    size: 'lg',
    description: 'Confira a prévia. "Baixar PDF" abre a impressão: escolha "Salvar como PDF" no destino.',
    body: html`
      ${options.warning ? notice({ tone: 'warning', title: 'Falta preencher', text: options.warning }) : ''}
      <div class="doc-preview">${documentSheet(doc)}</div>
      <footer class="form-actions">
        <div>${options.extraActions ?? ''}</div>
        <div class="form-actions__main">
          ${button({ label: 'Copiar texto', action: 'doc:copy', icon: 'copy' })}
          ${button({ label: 'Baixar PDF', action: 'doc:print', icon: 'download', variant: 'primary' })}
        </div>
      </footer>
    `,
  });
}

/** Imprime só a folha do documento (o resto da tela some na impressão). */
export function printDocument(doc: AgencyDocument): void {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.append(root);
  }
  root.innerHTML = documentSheet(doc).value;
  const previousTitle = document.title;
  // O nome da aba vira o nome sugerido do arquivo PDF.
  document.title = doc.fileName;
  document.body.classList.add('is-printing');
  const finish = () => {
    document.title = previousTitle;
    document.body.classList.remove('is-printing');
    if (root) root.innerHTML = '';
    window.removeEventListener('afterprint', finish);
  };
  window.addEventListener('afterprint', finish);
  window.print();
}

registerActions({
  'doc:print': () => {
    if (current) printDocument(current);
  },
  'doc:copy': async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(documentText(current));
      toast('Texto copiado.');
    } catch {
      toast('Não foi possível copiar automaticamente.', 'error');
    }
  },
});
