# Mawe OS

Escritório digital privado da **Mawe Create** — operação diária, comercial, clientes,
projetos, tarefas, biblioteca e agentes de IA, compartilhado por Maria Eduarda e Wesley.

> **Status: protótipo local (v0.1).** Funciona de verdade no navegador, mas ainda **sem
> login, sem banco de dados compartilhado e sem IA conectada**. Os dados ficam salvos
> apenas no navegador de quem está usando. Os registros iniciais são **fictícios**.

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

O teste de navegação usa o Playwright. Se for a primeira vez na sua máquina, rode também
`npx playwright install chromium`.

## O que já funciona

- **Painel**: saudação pelo horário, prioridades do dia, atrasadas, próximos prazos,
  resumo comercial, projetos em andamento e acesso aos agentes.
- **Comercial**: funil com 9 etapas (arrastar e soltar), lista, cadastro/edição,
  histórico, próxima ação, conversão de oportunidade ganha em cliente.
- **Clientes**: cadastro, projetos relacionados, status de contratação, parcelas
  registradas manualmente (marcar como paga), pendências.
- **Projetos**: etapas de produção, checklist de entrega, links (GitHub, site, teste),
  decisões e tarefas do projeto.
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
| Login individual         | Troca de perfil apenas visual, sem senha   | `src/domain/permissions.ts`, `src/data/store.ts` |
| Banco de dados           | `localStorage` (cada navegador tem o seu)  | Nova classe em `src/data/source.ts` |
| Modelo de IA             | Não conectado; nenhuma resposta é gerada   | `src/agents/provider.ts` (via servidor) |
| GitHub                   | Apenas o link do repositório               | Futuro módulo em `src/integrations/` |
| Publicação               | Roda só em `127.0.0.1`                     | Depois do login e do banco          |

## Logos

As logos oficiais ainda não estão no projeto. Veja [`public/brand/LEIA-ME.md`](public/brand/LEIA-ME.md).

## Documentação técnica

[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) explica a organização do código e os próximos passos.
