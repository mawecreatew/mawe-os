# Mawe OS — guia para assistentes de código

- Idioma da interface, comentários e documentação: português brasileiro.
- Stack: TypeScript sem framework e sem dependências de execução. `tsc` compila `src/` para `build/`.
- Verificação completa: `npm run check` (typecheck + `node --test` + teste de navegação com Playwright).
- Regras de negócio ficam em `src/domain/` (puras, testáveis). Telas em `src/views/` só renderizam e chamam `store().apply(...)`.
- Sempre gere HTML com o template `html` de `src/core/html.ts` (escapa texto). Nunca use `raw()` com dados do usuário.
- Cores e fontes só via variáveis de `src/styles/tokens.css`.
- Não simular respostas de IA, não conectar serviços externos e não inventar logos (ver `public/brand/LEIA-ME.md`).
- Dados de demonstração são fictícios (`src/data/seed.ts`); nunca incluir dados reais de clientes.
