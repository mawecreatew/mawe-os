# Mawe OS (Central MaweCreate)

Escritório digital privado da **Mawe Create**: operação diária, prospecção, clientes,
projetos, tarefas, marketing e gestão, compartilhado por Maria Eduarda e Wesley. Nas telas o
sistema se chama **Central** (o repositório continua `mawe-os`).

> **Status: v0.8.** Funciona de verdade no navegador. Tem dois modos:
> - **Protótipo local** (padrão): sem login, com dados **fictícios** salvos só neste navegador.
> - **Com login (Supabase)**: cada sócio entra com sua conta e os dois veem os mesmos dados.
>   Para ativar, siga [`docs/SUPABASE.md`](docs/SUPABASE.md).
>
> A IA ainda **não está conectada**.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 22.18 ou mais recente (versão LTS).

```bash
npm install        # instala as ferramentas de desenvolvimento (só na primeira vez)
npm start          # compila e abre o servidor em http://127.0.0.1:5173
```

Abra **http://127.0.0.1:5173** no navegador. Para parar, pressione `Ctrl + C` no terminal.

Enquanto estiver alterando o código, use `npm run dev`: ele recompila sozinho a cada
arquivo salvo — basta recarregar a página.

## Comandos

| Comando              | O que faz                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `npm start`          | Compila e inicia o sistema em `http://127.0.0.1:5173`                 |
| `npm run dev`        | Modo desenvolvimento (recompila ao salvar)                            |
| `npm test`           | Testes das regras de negócio (rápidos, sem navegador)                 |
| `npm run test:e2e`   | Abre o sistema num navegador automatizado e testa os fluxos principais |
| `npm run typecheck`  | Verifica erros de tipo no TypeScript                                  |
| `npm run check`      | Roda todas as verificações acima                                      |
| `npm run build:site` | Monta a pasta `dist/` para publicar (exige a configuração do Supabase) |

O teste de navegação usa o Playwright. Se for a primeira vez na sua máquina, rode também
`npx playwright install chromium`.

## O que já funciona

### Novidades da v0.8 (Central MaweCreate)

- **Visual**: "CENTRAL" embaixo da logo e o tema **Rosa bebê** (fundo rosa e menu claro). Cada
  pessoa escolhe a sua cor em Cores do sistema.
- **Menu novo**: botões **+ Novo lead** e **+ Adicionar** (tarefa, cliente, entrada, aprovação,
  contrato, nota, ideia de post), **acesso rápido** (Início, Planejamento, Bloco de notas,
  Tarefas, Chat) e as áreas em grupos que abrem e fecham: Comercial, Operações, Marketing,
  Administrativo e Agência.
- **Início (Central da agência)**: prioridades do dia (3, com botão para mais), **arcos** de
  atalho (leads ativos, clientes ativos, projetos, contratos, faturamento do mês, processos),
  **Pra fazer hoje** numa lista só e 4 números (entrou no mês, a receber, em cadência, fixo
  mensal). O gráfico de faturamento foi para o Financeiro e o funil ficou na Prospecção.
- **Prospecção com cadência**: Aquecimento (3 dias) → Pronto pra abordar → Aguardando resposta
  (follow-ups em 3, 7 e 15 dias) → Negociação → Fechou; sem resposta volta em 3 meses. A tela
  abre em **Quem chamar hoje**, com os botões Mandei, Respondeu, Sem resposta e Tentar de novo.
  O funil mostra só 3 números; o resto está em Relatórios. Os leads antigos foram para a etapa
  mais parecida (nenhum foi apagado; etapas sem par continuam no funil).
- **Clientes de A a Z** com índice de letras e busca. A ficha ganhou abas: **Onboarding**
  (checklist do começo), **Briefing** (perguntas editáveis, botão para copiar e mandar ao
  cliente), **Arquivos** (logo, fotos, contrato; imagens e PDF), **Acessos** (onde está cada
  acesso, nunca a senha), **Contratos** e **Depoimentos**. Origem e indicação de cada cliente.
- **Contratos e vencimentos**: avisa no Pra fazer hoje 30 dias antes de vencer; botão Renovar.
- **Planejamento da agência**: meta do mês (agora com posts), metas da semana de cada um e
  quadro de ideias (Ideia, Fazendo, Feito).
- **Bloco de notas** (cores, fixar, notas só suas, virar tarefa) e **Chat da equipe** (ligado a
  cliente, projeto ou lead; com o chat aberto as mensagens chegam em ~5 segundos; não há
  notificação no celular).
- **Marketing**: seguidores do Instagram da Mawe mês a mês com gráfico e comparação ano a ano,
  ideias de posts (Ideia, Gravando, Agendado, Postado), cases do portfólio e de onde vêm os
  clientes (quem indicou quem).
- **Administrativo**: atalhos de gestão, **divisão do dinheiro** (agência, impostos e cada
  sócio) e **cópia dos dados** em planilha (.xlsx) ou completa (.json).
- **Relatório do mês** em PDF, **Treinamento** (cada pessoa marca "li" e "já fiz sozinho" nos
  processos), **Kit** (orçamento rápido com mensagem pronta e links do portfólio) e **horas por
  projeto** (cronômetro ou registro manual, com quanto rendeu por hora).
- Quando os dois salvam ao mesmo tempo, a ação de quem salvou por último é refeita sobre a
  versão mais nova, sem perder nada.
- A Central de agentes saiu do menu (continua em `#/agentes`).

### Até a v0.7

- **Painel (gestão)**: **gráfico de faturamento** por período (7 dias, 30 dias, este mês,
  12 meses) com comparação ao período anterior, ticket médio e valor de cada dia ao passar o
  mouse; ao lado, lucro, despesas, a receber nos próximos 30 dias e receita recorrente dos
  planos mensais. **Foco de hoje** junta retornos comerciais, tarefas, contas e entregas
  vencidas ou do dia numa lista só (dá para concluir tarefas e marcar contas ali mesmo).
  **Funil de vendas** mostra a conversão de cada etapa e aponta onde vocês mais perdem
  clientes, com uma sugestão do que fazer. Depois, metas do mês e projetos em andamento.
- **Menu** agrupado pelo caminho do dinheiro: Vender, Entregar, Gestão e Recursos.
- **Painel › o dia (v0.7)**: as **3 prioridades** de cada sócio (cada um vê as do outro) e o
  **alinhamento da noite** (o que aconteceu, o que travou, o que fazer amanhã). O "amanhã"
  aparece no topo do dia seguinte.
- **Processos (v0.7)**: o manual da agência, do primeiro contato ao pós-venda. Cada etapa tem
  objetivo, quem faz, tempo e passo a passo, e pode ser editada. As etapas ligadas à produção
  aparecem dentro do projeto ("Como fazer esta etapa"). O manual sai em PDF para treinar
  quem entrar na equipe.
- **Aprovações (v0.7)**: briefing recebido, proposta aceita, prévia aprovada, alteração
  pedida... com data, canal, a frase do cliente e o **print ou PDF** como prova. Aparece no
  projeto (com as rodadas de alteração usadas), na ficha do cliente e na proposta.
- **Documentos em PDF (v0.7)**: proposta, contrato (pede CPF/CNPJ e endereço do cliente),
  manual do site para entregar ao cliente e manual de processos, com a marca. "Baixar PDF"
  abre a impressão do navegador ("Salvar como PDF"), sem bibliotecas externas.
- **Pós-venda (v0.7)**: quando um projeto vira "publicado", a ficha do cliente ganha o
  calendário de contatos (7 dias, 30 dias e a cada 3 meses), com mensagem pronta da
  Biblioteca. O próximo contato aparece no Foco de hoje.
- **Cores do sistema (v0.7)**: sete temas (Mawe, Vinho, Oliva, Rosé, Mar, Noite e Grafite),
  escolhidos por cada pessoa no menu ou em Sistema. Dados da agência (CPF/CNPJ, Pix, cidade)
  ficam em Sistema e entram nos documentos.
- **Comercial (v0.6)**: cada etapa diz **de quem é a vez** (nossa vez, vez do cliente ou pausado).
  Só fica pendente o que depende de vocês; quem espera o cliente mostra "aguardando há X dias" e,
  se a etapa pedir, "hora do follow-up" depois de N dias (para depois de 3 tentativas sem resposta).
  Números do topo com período: para agir hoje, leads ativos, aguardando cliente, mensagens
  enviadas, taxa de resposta e fechados, mais a **meta diária de contatos**. Cada lead tem
  **registro de contatos** (WhatsApp, ligação, resposta), **WhatsApp com mensagem pronta** da
  Biblioteca (registra o contato sozinho) e **motivo de perda** ao ir para a etapa final de perda.
  Aba **Relatórios**: contatos por semana, por que não fecham, origem e nicho que mais convertem.
- **Comercial (base)**: funil com **etapas configuráveis** pelos sócios (renomear, adicionar,
  remover movendo as oportunidades, reordenar; "Ganho" e "Perdido" fixos no fim), arrastar e
  soltar, lista, histórico, marcação de "contato feito" e "respondeu", conversão em cliente.
  **Excluir direto do card** (ícone de lixeira), **busca** por empresa/contato/segmento e
  **seleção de várias** oportunidades para excluir ou mover de etapa de uma vez.
- **Comercial › Propostas e contratos**: proposta com serviços do catálogo e total
  automático, status (rascunho → enviada → aceita/recusada), link do contrato assinado,
  início e forma de pagamento; ao aceitar, cria cliente, projetos e parcelas.
- **Clientes**: cadastro, projetos relacionados, status de contratação, parcelas
  registradas manualmente (marcar como paga), pendências.
- **Projetos**: tipos (site, plano mensal, pacote de conteúdo, sistema, outro), cada um com
  suas etapas, checklist e campos; plano mensal organizado por mês com "Renovar para o
  próximo mês"; filtro por tipo; excluir com confirmação; decisões e tarefas do projeto.
- **Calendário de conteúdo**: posts, carrosséis, stories e reels dos clientes e da
  MaweCreate, por mês ou semana, com cores por cliente ou status e ligação com os projetos.
- **Financeiro (v0.6)**: **caixa atual** somando todos os meses (com saldo inicial opcional),
  filtro de período (mês, 7/30 dias, 12 meses, desde o início), aba **Mês a mês** com caixa
  acumulado, **reservas** (caixinhas) e cobranças automáticas dos **planos mensais** dos clientes.
- **Financeiro (base)**: entradas e saídas, parcelas de clientes automáticas, despesas recorrentes
  (mensais/anuais) geradas sozinhas, quem pagou do próprio bolso, resumo e filtros.
- **Tráfego pago**: campanhas, resultados anotados à mão, custo por resultado e aprendizados.
- **Serviços e preços**: catálogo único com categorias editáveis, **preço promocional com
  validade** (volta sozinho ao normal) e **pacotes** que mostram a economia.
- **Clientes › ficha completa**: quanto já pagou, planos mensais (cobrança de cada mês, lembrete
  no WhatsApp), acessos e links, domínio com aviso de renovação.
- **Categorias**: listas editáveis (serviços, despesas, entradas, origem, nichos, motivos de perda).
- **Equipe**: papel de cada pessoa, números por pessoa e atividade recente (quem fez o quê).
- **Busca rápida**: `Ctrl + K` ou o botão "Buscar" do menu encontram leads, clientes, projetos,
  tarefas, serviços, propostas e modelos.
- **Tarefas**: criar, editar, concluir, excluir; responsável, prioridade, prazo,
  situação e vínculo com projeto/oportunidade/cliente; filtros e busca.
- **Biblioteca**: mensagens, propostas, checklists, processos e registro de decisões.
- **Central de agentes**: função, contexto e limites de cada agente; registro de pedidos;
  encaminhamento sugerido pelo coordenador (regras locais, sem IA).
- **Sistema**: estado real das integrações, exportar cópia em JSON, restaurar
  demonstração ou começar com base vazia.

## O que ainda não existe (e está preparado para existir)

| Item                     | Situação hoje                              | Onde integrar                       |
| ------------------------ | ------------------------------------------ | ----------------------------------- |
| Login individual         | ✅ Pronto com Supabase (ativar pelo guia)   | [`docs/SUPABASE.md`](docs/SUPABASE.md) |
| Banco de dados           | ✅ Pronto com Supabase; sem ele, `localStorage` | `src/integrations/supabase/` |
| Modelo de IA             | Não conectado; nenhuma resposta é gerada   | `src/agents/provider.ts` (via servidor) |
| GitHub                   | Apenas o link do repositório               | Futuro módulo em `src/integrations/` |
| Publicação               | ✅ Pronta para o Netlify (com login obrigatório) | [`docs/PUBLICACAO.md`](docs/PUBLICACAO.md) |

## Logos

As logos oficiais ainda não estão no projeto. Veja [`public/brand/LEIA-ME.md`](public/brand/LEIA-ME.md).

## Documentação técnica

[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) explica a organização do código e os próximos passos.
