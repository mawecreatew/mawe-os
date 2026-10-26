// Teste de navegação ponta a ponta: abre o Mawe OS num navegador real (Chromium,
// via Playwright) e executa os fluxos principais. Rode com: npm run test:e2e
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm install (e depois npx playwright install chromium)');
  process.exit(1);
}

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.once('data', resolve));

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
    const sections = { Comercial: 'Comercial', Clientes: 'Clientes', Projetos: 'Projetos', Tarefas: 'Tarefas', Biblioteca: 'Biblioteca', 'Central de agentes': 'Central de agentes', Sistema: 'Sistema', Painel: null };
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
    await page.locator('dialog.modal select[name=assigneeId]').selectOption('wesley');
    await page.locator('dialog.modal select[name=priority]').selectOption('alta');
    await submitModal();
    await page.getByText('Teste automatizado de tarefa').waitFor();
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
    for (const hash of ['#/painel', '#/comercial', '#/clientes', '#/projetos', '#/tarefas', '#/biblioteca']) {
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
  });

  assert.deepEqual(errors, [], 'erros no console do navegador');
  console.log(`\n${passed} verificações de navegação passaram, sem erros no console.`);
} catch (error) {
  if (errors.length) console.error('\nErros no console:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
