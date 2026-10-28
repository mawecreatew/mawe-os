# Mawe OS

Escritório digital privado da **Mawe Create** — operação diária, comercial, clientes,
projetos, tarefas, biblioteca e agentes de IA, compartilhado por Maria Eduarda e Wesley.

> **Status: v0.4.** Funciona de verdade no navegador. Tem dois modos:
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

- **Painel**: saudação pelo horário, **metas do mês** (faturamento, clientes novos,
  contatos de prospecção por origem, propostas enviadas e aceitas), prioridades do dia,
  atrasadas, próximos prazos, **contas a pagar e a receber**, resumo comercial e projetos.
- **Comercial**: funil com **etapas configuráveis** pelos sócios (renomear, adicionar,
  remover movendo as oportunidades, reordenar; "Ganho" e "Perdido" fixos no fim), arrastar e
  soltar, lista, histórico, marcação de "contato feito" e "respondeu", conversão em cliente.
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
- **Financeiro**: entradas e saídas, parcelas de clientes automáticas, despesas recorrentes
  (mensais/anuais) geradas sozinhas, quem pagou do próprio bolso, resumo e filtros.
- **Tráfego pago**: campanhas, resultados anotados à mão, custo por resultado e aprendizados.
- **Serviços e preços**: catálogo único (com a tabela de preços inicial), ativar/desativar.
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
