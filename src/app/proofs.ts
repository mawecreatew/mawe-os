/**
 * Provas das aprovações (print ou PDF da conversa com o cliente).
 *
 * - Com login (Supabase): o arquivo vai para o bucket privado `provas`
 *   (ver supabase/storage.sql). Só membros do Mawe OS leem e gravam.
 * - Protótipo local: a imagem é reduzida e fica junto com os dados deste
 *   navegador (PDFs só até 1,5 MB).
 */
import { registerActions } from '../core/events.ts';
import { createId } from '../core/id.ts';
import type { ApprovalProof } from '../domain/types.ts';
import { toast } from '../ui/overlay.ts';
import { auth } from './context.ts';

const BUCKET = 'provas';
const MAX_UPLOAD = 10 * 1024 * 1024;
const MAX_LOCAL_PDF = 1.5 * 1024 * 1024;
const LOCAL_IMAGE_SIDE = 1400;

export const PROOF_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

function safeName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-60);
  return cleaned || 'arquivo';
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

/** Reduz o print para caber nos dados locais do navegador. */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler esta imagem. Tente salvar o print de novo (PNG ou JPG).');
  });
  const scale = Math.min(1, LOCAL_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.75);
}

/**
 * Envia o arquivo e devolve a referência que fica salva na aprovação (ou nos
 * arquivos do cliente, com `folder` = "clientes/").
 */
export async function storeProof(file: File, folder = ''): Promise<ApprovalProof> {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) throw new Error('Use um print (PNG, JPG ou WEBP) ou um PDF.');
  if (file.size > MAX_UPLOAD) throw new Error('Arquivo grande demais (máximo 10 MB).');
  const session = auth();
  if (session.mode === 'supabase') {
    const path = `${folder}${new Date().toISOString().slice(0, 7)}/${createId(folder ? 'arq' : 'prova')}-${safeName(file.name)}`;
    const response = await session.client.files(`object/${BUCKET}/${path}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'cache-control': '3600' },
    });
    if (!response.ok) {
      if (response.status === 404 || response.status === 400) {
        throw new Error('O armazenamento de provas ainda não foi ativado no Supabase. Rode o arquivo supabase/storage.sql (veja docs/SUPABASE.md).');
      }
      throw new Error(`Não foi possível enviar o arquivo (erro ${response.status}).`);
    }
    return { path, name: file.name, type: file.type, size: file.size };
  }
  if (isPdf && file.size > MAX_LOCAL_PDF) throw new Error('No protótipo local, PDFs podem ter até 1,5 MB. Com login, até 10 MB.');
  const dataUrl = isImage ? await shrinkImage(file) : await readAsDataUrl(file);
  return { path: '', name: file.name, type: isImage ? 'image/jpeg' : file.type, size: file.size, dataUrl };
}

/** Apaga o arquivo do armazenamento (o registro já foi removido). Falhas são ignoradas. */
export async function discardProof(proof: ApprovalProof | null): Promise<void> {
  const session = auth();
  if (!proof?.path || session.mode !== 'supabase') return;
  await session.client.files(`object/${BUCKET}/${proof.path}`, { method: 'DELETE' }).catch(() => undefined);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2);
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

const cache = new Map<string, string>();

/** Encontra a prova pelo id da aprovação ou do arquivo do cliente (definido pelo main). */
let lookupProof: (approvalId: string) => ApprovalProof | undefined = () => undefined;
export function setProofLookup(fn: (approvalId: string) => ApprovalProof | undefined): void {
  lookupProof = fn;
}

/** Endereço para mostrar a prova na tela (data: no local, blob: com login). */
export async function proofUrl(proof: ApprovalProof): Promise<string> {
  if (proof.dataUrl) return proof.dataUrl;
  const cached = cache.get(proof.path);
  if (cached) return cached;
  const session = auth();
  if (session.mode !== 'supabase' || !proof.path) throw new Error('Arquivo indisponível.');
  const response = await session.client.files(`object/authenticated/${BUCKET}/${proof.path}`);
  if (!response.ok) throw new Error(`Não foi possível abrir o arquivo (erro ${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  cache.set(proof.path, url);
  return url;
}

/**
 * Imagens das provas: a tela desenha `<img data-proof="id da aprovação">` sem `src` e
 * este observador busca o arquivo depois (com login, o download é autenticado).
 */
export function installProofLoader(): void {
  const load = (img: HTMLImageElement) => {
    const proof = lookupProof(img.dataset.proof!);
    if (!proof || img.dataset.loading) return;
    img.dataset.loading = '1';
    proofUrl(proof)
      .then((url) => (img.src = url))
      .catch(() => img.replaceWith(Object.assign(document.createElement('span'), { className: 'proof__missing', textContent: 'Arquivo indisponível' })));
  };
  const scan = () => document.querySelectorAll<HTMLImageElement>('img[data-proof]:not([src])').forEach(load);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
}


registerActions({
  'proof:open': async (el) => {
    const proof = lookupProof(el.dataset.proof!);
    if (!proof) return;
    try {
      let url = await proofUrl(proof);
      // Navegadores bloqueiam abrir "data:" numa aba nova: converte em blob.
      if (url.startsWith('data:')) url = URL.createObjectURL(dataUrlToBlob(url));
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.', 'error');
    }
  },
});
