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
