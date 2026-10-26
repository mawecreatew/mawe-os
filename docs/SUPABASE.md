# Ativar o login (Supabase)

Com este passo a passo, Maria Eduarda e Wesley passam a ter **contas próprias com senha**
e a ver **os mesmos dados**, cada um no seu computador. Leva uns 15 minutos.

O Supabase tem plano gratuito, suficiente para o Mawe OS. Nada aqui exige cartão de crédito.

> **Segurança — leia antes**
> - Senhas: ninguém (nem o assistente de IA) precisa saber a senha de vocês.
> - Você vai copiar duas informações do Supabase: o **endereço do projeto** e a
>   **chave pública** (*anon* / *publishable*). Elas são feitas para ficar no navegador.
> - **Nunca** copie para o Mawe OS a chave **secreta** (*service_role* / *secret*). O sistema
>   recusa essa chave se ela for colada por engano.

---

## 1. Criar o projeto

1. Acesse https://supabase.com e crie uma conta (pode entrar com o GitHub).
2. Clique em **New project**.
   - **Name**: `mawe-os`
   - **Database password**: crie uma senha forte e guarde num lugar seguro (é a senha do
     banco, não a do login de vocês; o Mawe OS não usa essa senha).
   - **Region**: escolha a mais próxima (ex.: *South America (São Paulo)*).
3. Aguarde o projeto terminar de ser criado (1–2 minutos).

## 2. Criar as tabelas e as regras de acesso

1. No menu do projeto, abra **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/schema.sql`](../supabase/schema.sql) deste projeto, copie
   **todo** o conteúdo, cole no editor e clique em **Run**.
3. Deve aparecer "Success". (Se rodar de novo, não tem problema.)

## 3. Bloquear cadastros públicos

Assim, ninguém de fora consegue criar conta no seu projeto.

1. Abra **Authentication** → **Sign In / Providers** (em algumas versões: *Providers* ou
   *Settings*).
2. Desative **Allow new users to sign up** e salve.

Mesmo se alguém criasse uma conta, ela não veria nada: só contas cadastradas como membros
(passo 5) têm acesso aos dados.

## 4. Criar as duas contas

1. Abra **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha o e-mail e uma senha **provisória** da Maria Eduarda. Marque
   **Auto Confirm User** e crie.
3. Repita para o Wesley.
4. Envie a senha provisória ao Wesley por um canal privado. No primeiro acesso, cada um
   troca a própria senha em **Sistema → Trocar minha senha** dentro do Mawe OS.

## 5. Dar acesso ao Mawe OS

1. Abra [`supabase/members.sql`](../supabase/members.sql), troque
   `EMAIL-DA-MARIA@exemplo.com` e `EMAIL-DO-WESLEY@exemplo.com` pelos e-mails do passo 4.
2. Cole no **SQL Editor** → **New query** → **Run**.
3. O resultado deve mostrar **duas linhas** (maria e wesley). Se vier vazio, confira se os
   e-mails estão iguais aos do passo 4.

## 6. Ligar o Mawe OS ao projeto (em cada computador)

1. No Supabase, abra **Project Settings** → **API Keys** (ou **Data API**) e copie:
   - o **Project URL** (algo como `https://abcdefgh.supabase.co`);
   - a chave **anon public** ou **publishable** (começa com `eyJ...` ou `sb_publishable_...`).
2. Na pasta do Mawe OS, copie o arquivo `public/config.example.json` com o nome
   `public/config.json` e preencha:

   ```json
   {
     "supabaseUrl": "https://abcdefgh.supabase.co",
     "supabaseAnonKey": "cole-aqui-a-chave-publica"
   }
   ```

3. Rode `npm start` e abra http://127.0.0.1:5173. Deve aparecer a tela **Entrar**.

O arquivo `public/config.json` não vai para o GitHub (está no `.gitignore`). O Wesley faz
o passo 6 no computador dele, com as mesmas duas informações.

Para voltar ao modo protótipo (dados fictícios, sem login), basta renomear ou apagar
`public/config.json`.

---

## Como funciona

- Os dados ficam numa tabela `workspace`. Só quem está na tabela `members` lê ou altera
  (regras RLS). Visitantes sem login não acessam nada.
- Ao conectar pela primeira vez, a base começa **vazia**: os dados de demonstração nunca
  vão para o banco real.
- Se os dois salvarem algo ao mesmo tempo, a segunda gravação é recusada com um aviso, os
  dados são atualizados e basta refazer a ação. Nada é sobrescrito sem querer.
- Alterações do outro sócio aparecem sozinhas em até ~20 segundos (ou ao voltar para a aba).
- No plano gratuito, projetos sem uso por alguns dias podem ser pausados pelo Supabase.
  Se o Mawe OS não conectar, verifique no painel e clique para reativar.

## Problemas comuns

| Mensagem                                   | O que fazer                                                       |
| ------------------------------------------ | ----------------------------------------------------------------- |
| "Configuração incompleta"                  | Confira `public/config.json` (passo 6)                            |
| "E-mail ou senha incorretos"               | Confira os dados; para redefinir, Authentication → Users → ⋯     |
| "Conta sem acesso"                         | Rode o passo 5 com o e-mail correto                               |
| "A tabela workspace está vazia"            | Rode o passo 2                                                     |
| "Não foi possível conectar ao Supabase"    | Verifique a internet e se o projeto não está pausado               |

**Esqueceu a senha?** Em **Authentication → Users**, clique nos três pontinhos da conta e
use a opção de redefinir/enviar recuperação de senha, ou defina uma nova senha provisória.

## Para desenvolvedores

As regras de acesso têm testes que rodam num PostgreSQL local, simulando o Supabase:

```bash
createdb mawe_rls
psql -d mawe_rls -f supabase/tests/supabase-stub.sql
psql -d mawe_rls -f supabase/schema.sql
sed -e 's/EMAIL-DA-MARIA@exemplo.com/maria@example.com/; s/EMAIL-DO-WESLEY@exemplo.com/wesley@example.com/' supabase/members.sql | psql -d mawe_rls
psql -d mawe_rls -f supabase/tests/rls.test.sql
```

O teste de navegação (`npm run test:e2e`) usa um Supabase simulado (`scripts/fake-supabase.mjs`).

**Limitação conhecida:** todos os dados ficam num único registro JSON. É simples e seguro
para duas pessoas, mas não permite esconder partes dos dados (ex.: financeiro) de um
futuro colaborador. Quando isso for necessário, o próximo passo é separar em tabelas
(clientes, projetos, tarefas, parcelas...) com regras de acesso por tabela.
