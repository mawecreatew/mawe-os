# Publicar o Mawe OS na internet (Netlify)

Depois de publicado, cada sócio só precisa abrir o link e entrar com e-mail e senha.
Ninguém precisa instalar nada nem deixar o PowerShell aberto.

**Pré-requisito:** o Supabase já configurado ([docs/SUPABASE.md](SUPABASE.md)), com os
cadastros públicos desligados.

## Segurança

- O site publicado **sempre exige login**. Quem abrir o link sem conta vê só a tela de entrada.
- Os dados ficam no Supabase, protegidos pelas regras de acesso (só membros leem/gravam).
- O site leva apenas o endereço e a **chave pública** do Supabase (estão no `netlify.toml`).
  A chave secreta nunca é usada.
- O site não aparece no Google (`noindex`) e tem proteções do navegador contra
  ataques comuns (Content-Security-Policy e outras, também no `netlify.toml`).

## Passo a passo (uma única vez)

1. Acesse https://app.netlify.com e clique em **Sign up** → **GitHub**. Autorize.
2. Clique em **Add new project** (ou *Add new site*) → **Import an existing project** → **GitHub**.
3. Se o repositório `mawe-os` não aparecer, clique em **Configure Netlify on GitHub** e
   dê acesso a ele.
4. Escolha **mawecreatew/mawe-os**.
5. Em **Branch to deploy**, escolha `feat/mawe-os-v0.1` (até essa versão ir para a `main`).
6. **Project name**: `mawe-os` (o link será `mawe-os.netlify.app`; se o nome estiver em
   uso, escolha outro, como `mawe-create-os`).
7. Os campos de build já vêm preenchidos pelo `netlify.toml`
   (`npm run build:site` e `dist`). Não mude nada.
8. Clique em **Deploy**. Em 1–2 minutos aparece **Published** e o link do site.

## Atualizações

Toda vez que uma alteração for enviada ao GitHub nessa branch, o Netlify publica a nova
versão sozinho em poucos minutos. Para ver o andamento: Netlify → seu projeto → **Deploys**.

## Se mudar de projeto no Supabase

Atualize `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `netlify.toml` e envie ao GitHub.

## Testar a versão publicável no computador

```bash
SUPABASE_URL=https://seu-projeto.supabase.co SUPABASE_ANON_KEY=sb_publishable_... npm run build:site
```
A pasta `dist/` contém exatamente o que vai para a internet.
