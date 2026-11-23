# Arquitetura do Mawe OS

## Decisões

- **TypeScript sem framework e sem dependências de execução.** O ambiente em que a
  primeira versão foi criada não tinha acesso ao registro do npm, então React/Vite não
  puderam ser instalados. A solução escolhida usa só o que o navegador e o Node já têm,
  e organiza o código em camadas para que uma migração futura (ex.: para React ou
  Next.js) reaproveite tudo que não é tela: tipos, regras, dados, agentes e testes.
- **O navegador entende o código compilado diretamente** (módulos ES). O comando
  `tsc` transforma `src/**/*.ts` em `build/**/*.js`; não há empacotador.
- **Rotas por hash** (`#/comercial/opp_123`): funcionam em qualquer servidor estático.
- **HTML seguro por padrão**: as telas usam o template `html\`...\`` (`src/core/html.ts`),
  que escapa todo texto digitado. Isso impede que um conteúdo malicioso vire código.

## Camadas

```
src/
  core/        Utilitários sem regra de negócio: html seguro, datas, moeda, eventos, rotas
  domain/      O "coração": tipos, rótulos, permissões, cálculos (selectors) e alterações (operations)
  data/        Onde os dados ficam: DataSource (localStorage hoje), Store e dados de demonstração
  agents/      Definições dos agentes, encaminhamento do coordenador, contexto e provedor de IA
  app/         Casca da aplicação: menu, contexto global, carregamento da marca
  ui/          Componentes visuais reutilizáveis (botões, painéis, formulários, modal...)
  views/       Uma tela por arquivo
  styles/      tokens.css (cores, fontes) → base → layout → components → views
  config/      Configurações da marca
```

Regra de dependência: `views → ui/app → domain/data/agents → core`. O `domain` não
conhece o navegador — por isso pode ser testado com `node --test` e movido para um
servidor no futuro.

### Como uma alteração acontece

1. O HTML declara a intenção: `<button data-action="task:edit" data-id="...">`.
2. `core/events.ts` encontra o handler registrado pela tela.
3. O handler chama `store().apply(operacao)`.
4. O `Store` copia os dados, executa a operação (`domain/operations.ts`), salva na
   `DataSource` e pede para a tela ser redesenhada.

Se a operação lançar erro, nada é alterado e o erro aparece como aviso.

## Áreas adicionadas na v0.4

- `domain/normalize.ts`: completa dados salvos por versões anteriores (funil, financeiro,
  tipos de projeto etc.) de forma **determinística** — os dois sócios chegam ao mesmo
  resultado, e a sincronização não acusa diferença. O `schemaVersion` continua 1, então
  não é preciso mexer no Supabase.
- `domain/finance.ts`: lançamentos, despesas recorrentes (ocorrências calculadas na hora e
  gravadas só quando pagas) e a visão unificada com as parcelas de clientes.
- `domain/business.ts`: calendário de conteúdo, tráfego pago, catálogo de serviços,
  propostas (aceite cria cliente, projetos e parcelas) e metas/indicadores do mês.
- Etapas do funil ficam em `AppData.pipelineStages`; `ganho` e `perdido` são fixas.
- Tipos de projeto e seus modelos de etapas/checklist ficam em `domain/templates.ts`.

## Áreas adicionadas na v0.6

- `domain/commercial.ts`: tipo de cada etapa (`nossa_vez`, `vez_cliente`, `pausado`), situação de
  cada lead (`followStatus`), registro de contatos, motivos de perda, números do topo, relatórios
  e link do WhatsApp. "Atrasado" só existe quando a próxima ação depende da agência.
- `domain/categories.ts`: listas editáveis. Serviços guardam o id da categoria; as demais listas
  guardam o nome, e renomear atualiza os registros.
- `domain/finance.ts`: planos mensais dos clientes (`Client.subscriptions`), caixa atual
  (`cashPosition`), mês a mês (`monthByMonth`) e reservas.
- `domain/activity.ts` e `domain/search.ts`: atividade da equipe e busca rápida.
- `domain/normalize.ts` ganhou **ajustes únicos** (`meta.migrations`): rodam uma vez, de forma
  determinística, nos dados já salvos (ex.: tirar lembretes antigos de etapas que esperam o cliente).

## Áreas adicionadas na v0.7

- `domain/processes.ts`: manual de processos (`AppData.processes`), com etapas iniciais de ids
  fixos criadas pelo `normalize` e ligação com as etapas de produção dos projetos (`stageName`).
- `domain/approvals.ts`: aprovações com prova (`AppData.approvals`). O arquivo da prova fica no
  Supabase Storage (bucket privado `provas`, `supabase/storage.sql`) ou, no protótipo local,
  reduzido junto com os dados. `app/proofs.ts` envia, mostra (download autenticado) e apaga.
- `domain/documents.ts`: proposta, contrato, manual do site e manual de processos montados em
  blocos puros (testáveis). `ui/document.ts` mostra a prévia e imprime só a folha
  (`#print-root` + `@media print`), sem dependências.
- `domain/aftersales.ts`: calendário de pós-venda a partir de `Project.publishedAt` (gravado ao
  virar "publicado"); os contatos feitos ficam em `Client.afterSales`.
- `domain/daily.ts`: prioridades e alinhamento do dia (`AppData.daily`, guarda 60 dias) e dados
  da agência (`AppData.agency`).
- Temas (`app/theme.ts`): `data-tema` no `<html>`, cores em `styles/tokens.css`. As telas usam
  `--ink-*` para texto forte e `--paper-*` para fundos claros, o que permite temas escuros sem
  mexer em cada componente. Documentos usam `--doc-*`, iguais em qualquer tema.

## Áreas adicionadas na v0.8 (Central MaweCreate)

- `domain/cadence.ts`: cadência de prospecção. `migrateToCadence` (migração única
  `2026-11-cadencia`) troca as etapas abertas pelas da cadência e leva cada lead para a etapa
  mais parecida pelo nome; etapas sem par ficam. `PipelineStage.cadence` ([3, 7, 15]) faz
  `followStatus` calcular cada follow-up a partir do primeiro contato sem resposta;
  `Opportunity.cadenceFrom` recomeça a contagem no "Tentar de novo". `callToday` monta a lista
  "Quem chamar hoje".
- `domain/workspace.ts`: notas (`AppData.notes`), chat (`AppData.chat`, últimas 500 mensagens,
  `chatRead` por pessoa), metas da semana e ideias da agência, treinamento
  (`AppData.training`), horas (`Project.timeLogs` e cronômetro em `AppData.timers`) e divisão
  do dinheiro (`AppData.moneySplit`).
- `domain/clientcare.ts`: onboarding (`Client.onboarding`), briefing (`Client.briefing` e
  `AppData.briefingQuestions`), arquivos (`Client.files`, no mesmo bucket `provas`, pasta
  `clientes/`), acessos (`Client.accesses`, recusa texto que parece senha), contratos
  (`AppData.contracts`), origem e indicação, lista A a Z.
- `domain/marketing.ts`: ideias de posts, seguidores mês a mês, cases, links do portfólio,
  origem dos clientes e o relatório do mês. `domain/kit.ts`: orçamento rápido.
- `core/xlsx.ts`: planilha .xlsx sem dependências (ZIP sem compressão + XML). `domain/backup.ts`
  monta as abas.
- Menu (`app/shell.ts`): acesso rápido + grupos que abrem e fecham (estado em
  `localStorage`, chave `mawe-os:menu-aberto`). Tema Rosa bebê usa os tokens `--menu-*`
  (menu claro).
- `data/store.ts`: em conflito de versão, recarrega e refaz a mesma operação uma vez.
- No chat a sincronização roda a cada 5 segundos; nas outras telas, a cada 20.

## Permissões

`domain/permissions.ts` define o que cada papel pode fazer (`socio`, `colaborador`).
As telas consultam `can()` antes de mostrar dados financeiros. **No protótipo isso é só
interface** — a proteção real precisa existir no servidor/banco quando ele existir.

## Agentes

- `agents/definitions.ts`: função, contexto, exemplos e instruções de cada agente, com
  limites comuns (`AGENT_GUARDRAILS`) — nada é enviado, publicado ou pago sem aprovação.
- `agents/routing.ts`: triagem do coordenador por palavras-chave. Escolhe **um**
  especialista ou pede esclarecimento quando não há sinal claro.
- `agents/provider.ts`: interface `AIProvider`. Hoje é `NoAIProvider` (desconectado).
- Mensagens de sistema nas conversas são marcadas como "não é resposta de IA".

## Login e dados compartilhados (Supabase)

- `integrations/supabase/config.ts`: lê `public/config.json` (fora do Git). Sem o arquivo,
  o sistema roda no modo protótipo local.
- `integrations/supabase/client.ts`: login, renovação de sessão, saída, troca de senha e
  chamadas REST, só com `fetch` (o npm estava bloqueado; dispensa `@supabase/supabase-js`).
- `integrations/supabase/data-source.ts`: `SupabaseDataSource` grava o `AppData` inteiro na
  linha `main` da tabela `workspace`, com controle de versão (evita sobrescrever o sócio).
- `supabase/schema.sql`: tabelas, gatilho de versão e regras RLS (testadas em
  `supabase/tests/`). `src/main.ts` decide o modo na abertura.

## Próximos passos sugeridos

1. **Separar os dados em tabelas** (clientes, projetos, tarefas, parcelas...) quando
   entrar alguém além dos sócios, para aplicar RLS por tipo de dado (ex.: financeiro).
2. **Servidor para IA**: uma função de servidor que guarde a chave da API e implemente
   `AIProvider`. A chave nunca deve ficar no código do navegador.
3. **Ações propostas pelos agentes**: o agente devolve `proposedActions` (ex.: "criar
   tarefa"); a interface mostra para aprovação e só então chama a operação correspondente.
4. **GitHub (leitura)**: mostrar commits e pull requests do repositório de cada projeto.
5. **Publicação** somente depois do login real.
