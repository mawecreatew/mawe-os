// Teste de navegação ponta a ponta: abre o Mawe OS num navegador real (Chromium,
// via Playwright) e executa os fluxos principais. Rode com: npm run test:e2e
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { FAKE_ANON_KEY, startFakeSupabase } from './fake-supabase.mjs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm install (e depois npx playwright install chromium)');
  process.exit(1);
}

async function startAppServer(port, env = {}) {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe' });
  await new Promise((resolve) => child.stdout.once('data', resolve));
  return child;
}

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = await startAppServer(PORT);

// Segunda instância, com login: aponta para um Supabase simulado local.
const SUPA_PORT = 54392;
const LOGIN_PORT = 5198;
const LOGIN_BASE = `http://127.0.0.1:${LOGIN_PORT}/`;
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/config.json', JSON.stringify({ supabaseUrl: `http://127.0.0.1:${SUPA_PORT}`, supabaseAnonKey: FAKE_ANON_KEY }));
const fakeSupabase = await startFakeSupabase(SUPA_PORT);
const loginServer = await startAppServer(LOGIN_PORT, { MAWE_CONFIG_PATH: 'test-results/config.json' });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  // Os 404 esperados são das logos ainda não adicionadas em public/brand/.
  if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text());
});

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    console.error(`  ✖ ${name}\n    ${error.message}`);
    await page.screenshot({ path: 'test-results/falha.png', fullPage: true }).catch(() => {});
    throw error;
  }
}

const h1 = () => page.locator('.page-title').first().innerText();
/** Aguarda (até 5s) o título da tela ficar igual ao esperado — a troca de tela é assíncrona. */
async function expectTitle(expected) {
  const matches = (text) => (expected instanceof RegExp ? expected.test(text) : text === expected);
  const deadline = Date.now() + 5000;
  let text = '';
  while (Date.now() < deadline) {
    text = await h1().catch(() => '');
    if (matches(text)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`título esperado ${expected}, encontrado "${text}"`);
}
const go = async (hash) => {
  await page.goto(BASE + hash);
  await page.waitForSelector('.page-title');
};
const submitModal = async () => {
  await page.locator('dialog.modal button[type=submit]').click();
  await page.waitForSelector('dialog.modal', { state: 'hidden' });
};

try {
  console.log('Mawe OS — teste de navegação\n');

  await step('abre o painel com saudação e aviso de protótipo', async () => {
    await go('#/painel');
    await expectTitle(/^(Bom dia|Boa tarde|Boa noite), Maria Eduarda\.$/);
    assert.match(await page.locator('.env-banner').innerText(), /Protótipo local/);
    assert.ok((await page.locator('.task-row').count()) > 0);
  });

  await step('navega por todas as áreas pelo menu lateral', async () => {
    const sections = {
      Comercial: 'Comercial',
      Clientes: 'Clientes',
      Projetos: 'Projetos',
      Calendário: 'Calendário de conteúdo',
      Tarefas: 'Tarefas',
      Financeiro: 'Financeiro',
      'Tráfego pago': 'Tráfego pago',
      'Serviços e preços': 'Serviços e preços',
      Biblioteca: 'Biblioteca',
      'Central de agentes': 'Central de agentes',
      Sistema: 'Sistema',
      Painel: null,
    };
    for (const [label, title] of Object.entries(sections)) {
      await page.locator('.sidebar .nav__item', { hasText: label }).first().click();
      await page.waitForTimeout(50);
      if (title) await expectTitle(title);
      assert.equal(await page.locator('.sidebar .nav__item.is-active .nav__label').innerText(), label);
    }
  });

  await step('cria uma tarefa e ela aparece para a equipe', async () => {
    await go('#/tarefas');
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await page.locator('dialog.modal input[name=title]').fill('Teste automatizado de tarefa');
    const chip = (id) => page.locator('dialog.modal label.people-chip', { has: page.locator(`input[value="${id}"]`) });
    await chip('maria').click(); // desmarca quem está criando
    await chip('wesley').click();
    await page.locator('dialog.modal [data-people-input]').fill('Ana Teste');
    await page.locator('dialog.modal [data-people-input]').press('Enter');
    assert.equal(await page.locator('dialog.modal input[name=assigneeIds]:checked').count(), 2);
    await page.locator('dialog.modal select[name=priority]').selectOption('alta');
    await submitModal();
    await page.getByText('Teste automatizado de tarefa').waitFor();
    const row = page.locator('.table--tasks tbody tr', { hasText: 'Teste automatizado de tarefa' });
    assert.match(await row.locator('td[data-label="Responsável"]').innerText(), /Wesley e Ana/);
  });

  await step('filtra tarefas por responsável e situação', async () => {
    await page.locator('.segmented__item', { hasText: 'Wesley' }).click();
    const rows = page.locator('.table--tasks tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) assert.match(await rows.nth(i).innerText(), /Wesley/);
    await page.locator('.segmented__item', { hasText: 'Atrasadas' }).click();
    assert.ok((await rows.count()) > 0);
    assert.ok(await page.locator('.table--tasks tbody tr .due--overdue').count() === (await rows.count()));
    await page.locator('.segmented__item', { hasText: 'Equipe' }).click();
    await page.locator('.segmented__item', { hasText: 'Abertas' }).click();
  });

  await step('busca mantém o foco no campo enquanto digita', async () => {
    await page.locator('#task-search').pressSequentially('automatizado');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'task-search');
    assert.equal(await page.locator('.table--tasks tbody tr').count(), 1);
    await page.locator('#task-search').fill('');
  });

  await step('conclui uma tarefa pelo checkbox', async () => {
    const row = page.locator('tr', { hasText: 'Teste automatizado de tarefa' });
    await row.locator('input[type=checkbox]').click();
    await page.locator('.toast', { hasText: 'Tarefa concluída.' }).waitFor();
    await page.locator('.segmented__item', { hasText: 'Concluídas' }).click();
    await page.getByText('Teste automatizado de tarefa').waitFor();
    await page.locator('.segmented__item', { hasText: 'Abertas' }).click();
  });

  await step('texto digitado não é executado como código (proteção XSS)', async () => {
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await page.locator('dialog.modal input[name=title]').fill('<img src=x onerror="window.__xss=1">');
    await submitModal();
    await page.getByText('<img src=x onerror="window.__xss=1">').waitFor();
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  });

  await step('cadastra oportunidade, registra histórico e muda etapa', async () => {
    await go('#/comercial');
    assert.ok((await page.locator('.board__column').count()) === 9);
    await page.getByRole('button', { name: 'Nova oportunidade' }).first().click();
    await page.locator('dialog.modal input[name=company]').fill('Empresa Teste E2E');
    await page.locator('dialog.modal input[name=estimatedValue]').fill('2.500');
    await page.locator('dialog.modal select[name=stage]').selectOption('negociacao');
    await submitModal();
    await page.locator('.opp-card', { hasText: 'Empresa Teste E2E' }).click();
    await expectTitle('Empresa Teste E2E');
    assert.match(await page.locator('.info').innerText(), /R\$\s?2\.500/);
    await page.locator('#opp-note').fill('Ligação feita, cliente pediu proposta.');
    await page.locator('#opp-note').press('Enter');
    await page.getByText('Ligação feita, cliente pediu proposta.').waitFor();
    await page.locator('#opp-stage').selectOption('aguardando_resposta');
    await page.getByText(/Negociação → Aguardando resposta/).waitFor();
  });

  await step('prepara contexto da oportunidade para o agente comercial', async () => {
    await page.getByRole('button', { name: 'Preparar para o agente comercial' }).click();
    await page.waitForURL(/#\/agentes\/comercial/);
    await expectTitle('Agente comercial');
    assert.match(await page.locator('#agent-message').inputValue(), /Oportunidade: Empresa Teste E2E/);
  });

  await step('converte oportunidade ganha em cliente', async () => {
    await go('#/comercial');
    await page.locator('.segmented__item', { hasText: 'Lista' }).click();
    await page.locator('table a', { hasText: 'Empresa Teste E2E' }).click();
    await page.locator('#opp-stage').selectOption('ganho');
    await page.getByRole('button', { name: 'Converter em cliente' }).click();
    await page.waitForURL(/#\/clientes\/cli_/);
    await expectTitle('Empresa Teste E2E');
  });

  await step('registra parcela e marca como paga', async () => {
    await page.getByRole('button', { name: 'Registrar parcela' }).click();
    await page.locator('dialog.modal input[name=description]').fill('Entrada');
    await page.locator('dialog.modal input[name=amount]').fill('1.000,00');
    await submitModal();
    const item = page.locator('.installment', { hasText: 'Entrada' });
    await item.locator('input[type=checkbox]').check();
    await page.locator('.installment.is-paid', { hasText: 'Entrada' }).waitFor();
    assert.match(await page.locator('.finance-summary').innerText(), /Recebido\s*R\$\s?1\.000,00/);
  });

  await step('cria projeto a partir do cliente com etapas padrão', async () => {
    await page.getByRole('button', { name: 'Novo projeto' }).click();
    await page.locator('dialog.modal .type-chooser__item', { hasText: 'Site' }).first().click();
    await page.locator('dialog.modal input[name=name]').fill('Site Teste E2E');
    await page.locator('dialog.modal input[name=dueDate]').fill('2030-01-15');
    await page.locator('dialog.modal input[name=repository]').fill('github.com/exemplo/site-teste');
    await submitModal();
    await page.waitForURL(/#\/projetos\/prj_/);
    await expectTitle('Site Teste E2E');
    assert.equal(await page.locator('.stage').count(), 6);
    await page.locator('.ext-link', { hasText: 'github.com/exemplo/site-teste' }).waitFor();
  });

  await step('avança etapa, usa checklist e registra decisão', async () => {
    await page.locator('.stage__button').first().click();
    await page.locator('.stage--em_andamento').first().waitFor();
    await page.locator('#checklist-new').fill('Item extra de teste');
    await page.locator('#checklist-new').press('Enter');
    const item = page.locator('.checklist__item', { hasText: 'Item extra de teste' });
    await item.locator('input[type=checkbox]').check();
    await page.locator('.checklist__item.is-done', { hasText: 'Item extra de teste' }).waitFor();
    await page.locator('.panel', { hasText: 'Decisões' }).getByRole('button', { name: 'Registrar' }).click();
    await page.locator('dialog.modal input[name=title]').fill('Usar paleta neutra');
    await submitModal();
    await page.locator('.decision', { hasText: 'Usar paleta neutra' }).waitFor();
  });


  // ------------------------------------------------------------ Novas áreas

  const modal = () => page.locator('dialog.modal');

  await step('funil: adiciona, renomeia, reordena e remove etapa sem perder oportunidades', async () => {
    await go('#/comercial');
    await page.getByRole('tab', { name: 'Funil' }).click();
    const columnsBefore = await page.locator('.board__column').count();
    assert.ok(columnsBefore > 0);
    await page.getByRole('button', { name: 'Etapas do funil' }).click();
    await modal().locator('#stage-new').fill('Reunião marcada');
    await modal().locator('#stage-new').press('Enter');
    await modal().locator('.stage-editor__row input[value="Reunião marcada"]').waitFor();
    // Nova etapa entra antes de "Ganho".
    const labels = await modal().locator('.stage-editor__row input').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(labels.slice(-3), ['Reunião marcada', 'Ganho', 'Perdido']);
    // Renomeia
    const input = modal().locator('.stage-editor__row input[value="Reunião marcada"]');
    await input.fill('Reunião agendada');
    await input.press('Tab');
    await page.locator('.toast', { hasText: 'Etapa renomeada' }).waitFor();
    // Sobe uma posição
    await modal().getByRole('button', { name: 'Subir Reunião agendada' }).click();
    await modal().locator('.stage-editor__row').nth(labels.length - 4).locator('input[value="Reunião agendada"]').waitFor();
    await modal().getByRole('button', { name: 'Concluir' }).click();
    assert.equal(await page.locator('.board__column').count(), columnsBefore + 1);
    // Remove uma etapa com oportunidades: pede destino e move.
    await page.getByRole('button', { name: 'Etapas do funil' }).click();
    const negotiationCount = Number(await modal().locator('.stage-editor__row', { has: page.locator('input[value="Negociação"]') }).locator('.stage-editor__count').innerText());
    assert.ok(negotiationCount > 0);
    await modal().getByRole('button', { name: 'Remover Negociação' }).click();
    await modal().locator('select[name=target]').selectOption({ label: 'Reunião agendada' });
    await modal().getByRole('button', { name: 'Mover e remover etapa' }).click();
    await page.locator('.toast', { hasText: 'Etapa removida' }).waitFor();
    await modal().getByRole('button', { name: 'Concluir' }).click();
    const column = page.locator('.board__column', { has: page.locator('.board__title', { hasText: 'Reunião agendada' }) });
    assert.equal(await column.locator('.opp-card').count(), negotiationCount);
    assert.equal(await page.locator('.board__title', { hasText: 'Negociação' }).count(), 0);
  });

  await step('prospecção: marca contato feito e resposta', async () => {
    await page.locator('.opp-card__link').first().click();
    await page.waitForURL(/#\/comercial\/opp_/);
    await page.locator('.panel', { hasText: 'Prospecção' }).waitFor();
    const contacted = page.getByRole('button', { name: 'Marcar contato feito hoje' });
    if (await contacted.count()) await contacted.click();
    await page.locator('.milestone.is-done', { hasText: 'Contato feito' }).waitFor();
    await page.getByRole('button', { name: 'Marcar que respondeu hoje' }).click();
    await page.locator('.milestone.is-done', { hasText: 'Respondeu' }).waitFor();
  });

  await step('serviços: cadastra, aparece no catálogo e desativa', async () => {
    await go('#/servicos');
    assert.ok((await page.locator('.service-card').count()) >= 9, 'catálogo inicial deveria existir');
    await page.getByRole('button', { name: 'Novo serviço' }).click();
    await modal().locator('input[name=name]').fill('Pacote de feed E2E');
    await modal().locator('select[name=category]').selectOption('conteudo');
    await modal().locator('input[name=price]').fill('350');
    await modal().locator('textarea[name=includes]').fill('8 posts no feed\n4 stories');
    await submitModal();
    const card = page.locator('.service-card', { hasText: 'Pacote de feed E2E' });
    await card.waitFor();
    await card.getByRole('button', { name: 'Desativar' }).click();
    await page.locator('.service-card', { hasText: 'Pacote de feed E2E' }).waitFor({ state: 'detached' });
    await page.getByRole('tab', { name: /Todos/ }).click();
    await page.locator('.service-card.is-inactive', { hasText: 'Pacote de feed E2E' }).getByRole('button', { name: 'Ativar' }).click();
  });

  await step('proposta: soma serviços, envia, aceita e cria projetos e parcelas', async () => {
    await go('#/comercial/propostas');
    await expectTitle('Comercial');
    await page.getByRole('button', { name: 'Nova proposta' }).first().click();
    await modal().locator('select[name=to]').selectOption({ label: 'Studio Equilíbrio Pilates' });
    await modal().locator('input[name=svc][value=svc_landing]').check();
    await modal().locator('input[name=svc][value=svc_essencial]').check();
    await modal().locator('[data-proposal-total]', { hasText: 'R$ 600,00 + R$ 49,00/mês' }).waitFor();
    await modal().locator('input[name="price:svc_landing"]').fill('650');
    await modal().locator('[data-proposal-total]', { hasText: 'R$ 650,00 + R$ 49,00/mês' }).waitFor();
    await modal().locator('input[name=contractLink]').fill('drive.google.com/contrato-teste');
    await submitModal();
    await page.waitForURL(/#\/comercial\/propostas\/ppl_/);
    await page.getByRole('tab', { name: 'Enviada' }).click();
    await page.locator('.page-header .badge', { hasText: 'Enviada' }).waitFor();
    await page.getByRole('tab', { name: 'Aceita' }).click();
    await modal().getByRole('button', { name: 'Confirmar' }).click();
    await page.locator('.toast', { hasText: '2 projetos criados' }).waitFor();
    await page.locator('.panel', { hasText: 'Projetos criados' }).locator('a', { hasText: 'Plano Essencial' }).waitFor();
    await go('#/financeiro');
    await page.locator('.movement:not(.is-paid)', { hasText: 'Studio Equilíbrio Pilates · Entrada (50%)' }).waitFor();
  });

  await step('projetos: plano mensal com renovação, filtro por tipo e exclusão com confirmação', async () => {
    await go('#/projetos');
    await page.getByRole('tab', { name: /Plano mensal/ }).click();
    const plan = page.locator('.project-card', { hasText: 'Studio Equilíbrio Pilates' }).first();
    await plan.click();
    await page.waitForURL(/#\/projetos\/prj_/);
    await expectTitle(/^Plano Essencial – Studio Equilíbrio Pilates – [A-ZÇ][a-zç]+\/\d{4}$/);
    assert.equal(await page.locator('.panel', { hasText: 'Repositório GitHub' }).count(), 0, 'plano não mostra GitHub');
    await page.locator('.panel', { hasText: 'Pasta das artes' }).waitFor();
    await page.getByRole('button', { name: 'Renovar para o próximo mês' }).click();
    await page.locator('.toast', { hasText: 'Plano renovado' }).waitFor();
    assert.equal(await page.locator('.month-list__item').count(), 2);
    // Excluir: pede confirmação; cancelar não apaga.
    const title = await h1();
    await page.locator('.page-header').getByRole('button', { name: 'Excluir' }).click();
    await modal().locator('.confirm-text', { hasText: 'Tem certeza que deseja excluir este projeto?' }).waitFor();
    await modal().getByRole('button', { name: 'Cancelar' }).click();
    await expectTitle(title);
    await page.locator('.page-header').getByRole('button', { name: 'Excluir' }).click();
    await modal().getByRole('button', { name: 'Excluir projeto' }).click();
    await page.waitForURL(/#\/projetos$/);
    assert.equal(await page.locator('.project-card', { hasText: title }).count(), 0);
  });

  await step('projetos: pacote de conteúdo com quantidades no checklist', async () => {
    await go('#/projetos');
    await page.getByRole('button', { name: 'Novo projeto' }).click();
    await modal().locator('.type-chooser__item', { hasText: 'Pacote de conteúdo' }).click();
    await modal().locator('input[name=name]').fill('Pacote E2E');
    await modal().locator('input[name=dueDate]').fill('2030-02-01');
    await modal().locator('input[name=posts]').fill('6');
    await modal().locator('input[name=stories]').fill('10');
    await submitModal();
    await page.waitForURL(/#\/projetos\/prj_/);
    await page.locator('.checklist__item', { hasText: '6 posts no feed' }).waitFor();
    await page.locator('.checklist__item', { hasText: '10 stories' }).waitFor();
    await page.locator('.stage__name', { hasText: 'Criação das artes' }).waitFor();
  });

  await step('calendário: cria conteúdo ligado ao projeto e muda status na semana', async () => {
    await page.locator('.panel', { hasText: 'Conteúdos no calendário' }).getByRole('button', { name: 'Novo conteúdo' }).click();
    await modal().locator('input[name=title]').fill('Post de teste E2E');
    await modal().locator('input[name=date]').fill(await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
    await submitModal();
    await page.locator('.content-mini', { hasText: 'Post de teste E2E' }).waitFor();
    await go('#/calendario');
    await page.locator('.cal-item', { hasText: 'Post de teste E2E' }).waitFor();
    await page.getByRole('tab', { name: 'Semana' }).click();
    const card = page.locator('.cal-card', { hasText: 'Post de teste E2E' });
    await card.locator('select').selectOption('postado');
    await page.locator('.toast', { hasText: 'Postado' }).waitFor();
    await page.getByRole('tab', { name: 'Cor por status' }).click();
    await page.locator('.cal-card.tone--success', { hasText: 'Post de teste E2E' }).waitFor();
    await page.getByRole('tab', { name: 'Mês' }).click();
  });

  await step('financeiro: despesa do bolso de um sócio, recorrente gerada sozinha e resumo', async () => {
    await go('#/financeiro');
    await page.getByRole('button', { name: 'Nova despesa' }).click();
    await modal().locator('input[name=description]').fill('Hospedagem E2E');
    await modal().locator('input[name=amount]').fill('19,90');
    await modal().locator('select[name=category]').selectOption('Hospedagem');
    await modal().locator('select[name=situation]').selectOption('pago');
    await modal().locator('select[name=paidBy]').selectOption('maria');
    await submitModal();
    await page.locator('.movement', { hasText: 'Hospedagem E2E' }).locator('.badge', { hasText: 'Do bolso: Maria' }).waitFor();
    await page.locator('.notice', { hasText: 'Pago do bolso dos sócios' }).waitFor();
    // Recorrente: cadastra uma vez, vencimento aparece sozinho no mês.
    await page.getByRole('button', { name: 'Despesa recorrente' }).click();
    await modal().locator('input[name=description]').fill('Assinatura E2E');
    await modal().locator('input[name=amount]').fill('50');
    await submitModal();
    const rec = page.locator('.movement', { hasText: 'Assinatura E2E' });
    await rec.waitFor();
    await rec.locator('input[type=checkbox]').check();
    await page.locator('.movement.is-paid', { hasText: 'Assinatura E2E' }).waitFor();
    // Próximo mês também tem a ocorrência, sem cadastrar de novo.
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.locator('.movement:not(.is-paid)', { hasText: 'Assinatura E2E' }).waitFor();
    await page.getByRole('button', { name: 'Mês atual' }).click();
    await page.getByRole('tab', { name: /Despesas recorrentes/ }).click();
    await page.locator('tr', { hasText: 'Assinatura E2E' }).waitFor();
    await page.getByRole('tab', { name: 'Entradas e saídas' }).click();
  });

  await step('tráfego pago: campanha com custo por resultado calculado', async () => {
    await go('#/trafego');
    await page.getByRole('button', { name: 'Nova campanha' }).click();
    await modal().locator('input[name=name]').fill('Campanha E2E');
    await modal().locator('input[name=budget]').fill('100');
    await modal().locator('input[name=spent]').fill('40');
    await modal().locator('input[name=results]').fill('8');
    await modal().locator('textarea[name=learnings]').fill('Vídeo foi melhor que imagem');
    await submitModal();
    const card = page.locator('.campaign', { hasText: 'Campanha E2E' });
    await card.locator('.metric', { hasText: 'Custo por resultado' }).locator('strong', { hasText: 'R$ 5,00' }).waitFor();
    await page.locator('.learning-list', { hasText: 'Vídeo foi melhor que imagem' }).waitFor();
  });

  await step('painel: metas do mês com progresso e contas a pagar', async () => {
    await go('#/painel');
    await page.getByRole('button', { name: 'Definir metas' }).click();
    await modal().locator('input[name=revenue]').fill('5000');
    await modal().locator('input[name=contacts]').fill('40');
    await submitModal();
    const goals = page.locator('.goals-panel');
    await goals.locator('.goal', { hasText: 'Faturamento do mês' }).locator('small', { hasText: 'de R$ 5.000' }).waitFor();
    await goals.locator('.goal__sources', { hasText: 'Google Maps' }).waitFor();
    await page.locator('.panel', { hasText: 'Contas a pagar e a receber' }).waitFor();
  });

  await step('biblioteca: abre modelo, alterna categorias e mostra decisões', async () => {
    await go('#/biblioteca');
    await page.locator('.library-card').first().click();
    await page.locator('dialog.modal .library-content').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.segmented__item', { hasText: 'Checklists' }).click();
    await page.waitForURL(/#\/biblioteca\/checklist/);
    await page.locator('.segmented__item', { hasText: 'Decisões' }).click();
    await page.locator('.decision-log__item', { hasText: 'Usar paleta neutra' }).waitFor();
  });

  await step('coordenador registra pedido sem simular IA e sugere encaminhamento', async () => {
    await go('#/agentes/coordenador');
    await page.locator('#agent-message').fill('Preciso de uma proposta e uma mensagem de acompanhamento para um cliente');
    await page.getByRole('button', { name: 'Registrar pedido' }).click();
    const system = page.locator('.msg--system').last();
    await system.waitFor();
    const text = await system.innerText();
    assert.match(text, /não é resposta de IA/);
    assert.match(text, /Agente comercial/);
    await system.getByRole('button', { name: /Encaminhar ao Agente comercial/ }).click();
    await page.waitForURL(/#\/agentes\/comercial/);
    await page.locator('.msg--user', { hasText: 'Preciso de uma proposta' }).waitFor();
  });

  await step('troca o perfil ativo para Wesley', async () => {
    await go('#/painel');
    await page.locator('.profile__option', { hasText: 'Wesley' }).click();
    await expectTitle(/, Wesley\.$/);
  });

  await step('dados persistem após recarregar a página', async () => {
    await page.reload();
    await page.waitForSelector('.page-title');
    await expectTitle(/, Wesley\.$/);
    await go('#/tarefas');
    await page.locator('.segmented__item', { hasText: 'Todas' }).click();
    await page.getByText('Teste automatizado de tarefa').waitFor();
  });

  await step('base vazia exibe estados vazios em todas as áreas', async () => {
    await go('#/sistema');
    await page.getByRole('button', { name: 'Começar com base vazia' }).click();
    await page.locator('dialog.modal').getByRole('button', { name: 'Apagar e começar' }).click();
    for (const hash of ['#/painel', '#/comercial', '#/comercial/propostas', '#/clientes', '#/projetos', '#/calendario', '#/tarefas', '#/financeiro', '#/trafego', '#/biblioteca']) {
      await go(hash);
      assert.ok((await page.locator('.empty-state').count()) > 0, `sem estado vazio em ${hash}`);
    }
    assert.match(await page.locator('.env-banner').innerText(), /Base local/);
  });

  await step('restaura os dados de demonstração', async () => {
    await go('#/sistema');
    await page.getByRole('button', { name: 'Restaurar demonstração' }).click();
    await page.locator('dialog.modal').getByRole('button', { name: 'Restaurar' }).click();
    await go('#/clientes');
    assert.ok((await page.locator('.client-card').count()) >= 4);
  });

  await step('endereço inexistente mostra página não encontrada', async () => {
    await go('#/nao-existe');
    await expectTitle('Página não encontrada');
  });

  await step('celular: menu abre, navega e fecha', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go('#/painel');
    await page.waitForTimeout(350); // animação do menu ao trocar de tamanho de tela
    assert.equal(await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right <= 0), true, 'menu deveria estar recolhido');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.locator('.sidebar .nav__item', { hasText: 'Projetos' }).click();
    await page.waitForURL(/#\/projetos/);
    await expectTitle('Projetos');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('body').evaluate((b) => b.classList.contains('nav-open')), false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `rolagem horizontal indesejada: ${overflow}px`);
    for (const hash of ['#/calendario', '#/financeiro', '#/trafego', '#/servicos', '#/comercial/propostas', '#/painel']) {
      await go(hash);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(extra <= 0, `rolagem horizontal indesejada em ${hash}: ${extra}px`);
    }
  });

  console.log('\nCom login (Supabase simulado)\n');
  const titleOf = (p) => p.locator('.page-title, .auth-card__title').first().innerText();
  async function expectTitleOn(p, expected) {
    const matches = (text) => (expected instanceof RegExp ? expected.test(text) : text === expected);
    const deadline = Date.now() + 5000;
    let text = '';
    while (Date.now() < deadline) {
      text = await titleOf(p).catch(() => '');
      if (matches(text)) return;
      await p.waitForTimeout(50);
    }
    assert.fail(`título esperado ${expected}, encontrado "${text}"`);
  }
  async function login(p, email, password) {
    await p.locator('#login-email').fill(email);
    await p.locator('#login-password').fill(password);
    await p.getByRole('button', { name: 'Entrar' }).click();
  }
  const watchErrors = (p) => {
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/404|Failed to load resource|status of 40[01]/.test(m.text())) errors.push(m.text());
    });
  };

  const mariaContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' });
  const maria = await mariaContext.newPage();
  watchErrors(maria);

  await step('sem login, o sistema mostra apenas a tela de entrada', async () => {
    await maria.goto(LOGIN_BASE + '#/clientes');
    await expectTitleOn(maria, 'Entrar');
    assert.equal(await maria.locator('.sidebar').isVisible(), false);
    assert.equal(await maria.locator('.client-card').count(), 0);
  });

  await step('senha errada mostra mensagem clara', async () => {
    await login(maria, 'maria@example.com', 'senha-errada');
    await maria.locator('.auth-message--error', { hasText: 'E-mail ou senha incorretos.' }).waitFor();
    assert.equal(await maria.locator('#login-email').inputValue(), 'maria@example.com');
  });

  await step('conta que não é membro não acessa os dados', async () => {
    await login(maria, 'intruso@example.com', 'senha-do-intruso-123');
    await expectTitleOn(maria, 'Conta sem acesso');
    await maria.getByRole('button', { name: 'Sair' }).click();
    await expectTitleOn(maria, 'Entrar');
  });

  await step('Maria entra e começa com a base vazia, sem dados fictícios', async () => {
    await login(maria, 'maria@example.com', 'senha-da-maria-123');
    await expectTitleOn(maria, 'Clientes'); // volta para a página que tinha sido pedida
    assert.ok((await maria.locator('.empty-state').count()) > 0);
    await maria.goto(LOGIN_BASE + '#/painel');
    await expectTitleOn(maria, /, Maria Eduarda\.$/);
    assert.match(await maria.locator('.env-banner').innerText(), /Conectado/);
    assert.match(await maria.locator('.profile').innerText(), /maria@example\.com/);
    assert.equal(await maria.locator('.profile__switch').count(), 0, 'não deve haver troca de perfil com login');
    assert.equal(await maria.locator('.demo-tag').count(), 0);
  });

  await step('Maria cria uma tarefa para o Wesley', async () => {
    await maria.goto(LOGIN_BASE + '#/tarefas');
    await maria.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await maria.locator('dialog.modal input[name=title]').fill('Revisar contrato do cliente');
    await maria.locator('dialog.modal label.people-chip', { has: maria.locator('input[value="wesley"]') }).click();
    await maria.locator('dialog.modal button[type=submit]').click();
    await maria.getByText('Revisar contrato do cliente').waitFor();
    const saved = fakeSupabase.workspace.data.tasks.find((t) => t.title === 'Revisar contrato do cliente');
    assert.deepEqual(saved.assigneeIds, ['maria', 'wesley'], 'deveria ficar com os dois responsáveis');
    assert.equal(fakeSupabase.workspace.version, 2, 'deveria ter gravado no Supabase');
  });

  const wesleyContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' });
  const wesley = await wesleyContext.newPage();
  watchErrors(wesley);

  await step('Wesley entra no próprio navegador e vê a tarefa da Maria', async () => {
    await wesley.goto(LOGIN_BASE);
    await login(wesley, 'wesley@example.com', 'senha-do-wesley-123');
    await expectTitleOn(wesley, /, Wesley\.$/);
    await wesley.goto(LOGIN_BASE + '#/tarefas');
    await wesley.getByText('Revisar contrato do cliente').waitFor();
  });

  await step('alteração do Wesley aparece para a Maria sem recarregar', async () => {
    await wesley.locator('tr', { hasText: 'Revisar contrato do cliente' }).locator('input[type=checkbox]').click();
    await wesley.locator('.toast', { hasText: 'Tarefa concluída.' }).waitFor();
    await maria.locator('.segmented__item', { hasText: 'Concluídas' }).click();
    await maria.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await maria.evaluate(() => window.dispatchEvent(new Event('focus')));
    await maria.getByText('Revisar contrato do cliente').waitFor();
  });

  await step('tela Sistema mostra login ativo e esconde ações que apagam dados', async () => {
    await maria.goto(LOGIN_BASE + '#/sistema');
    await expectTitleOn(maria, 'Sistema');
    assert.match(await maria.locator('.integrations').innerText(), /Autenticação\s*\n?.*Ativa/s);
    assert.equal(await maria.getByRole('button', { name: 'Começar com base vazia' }).count(), 0);
  });

  await step('Maria troca a senha, sai e entra com a nova senha', async () => {
    await maria.locator('input[name=password]').fill('curta');
    await maria.locator('input[name=confirm]').fill('curta');
    await maria.getByRole('button', { name: 'Alterar senha' }).click();
    await maria.locator('.toast--error', { hasText: 'pelo menos 10 caracteres' }).waitFor();
    await maria.locator('input[name=password]').fill('nova-senha-maria-2026');
    await maria.locator('input[name=confirm]').fill('nova-senha-maria-2026');
    await maria.getByRole('button', { name: 'Alterar senha' }).click();
    await maria.locator('.toast', { hasText: 'Senha alterada' }).waitFor();
    await maria.locator('.profile__logout').click();
    await expectTitleOn(maria, 'Entrar');
    await maria.reload();
    await expectTitleOn(maria, 'Entrar');
    await login(maria, 'maria@example.com', 'senha-da-maria-123');
    await maria.locator('.auth-message--error').waitFor();
    await login(maria, 'maria@example.com', 'nova-senha-maria-2026');
    await expectTitleOn(maria, 'Sistema');
  });

  await mariaContext.close();
  await wesleyContext.close();

  assert.deepEqual(errors, [], 'erros no console do navegador');
  console.log(`\n${passed} verificações de navegação passaram, sem erros no console.`);
} catch (error) {
  if (errors.length) console.error('\nErros no console:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  loginServer.kill();
  fakeSupabase.server.close();
}
