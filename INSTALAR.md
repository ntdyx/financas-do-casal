# Instalar o Finanças do Casal pro seu casal

Você vai ter uma cópia só sua: seu banco de dados, sua conta na Pluggy, seu site.
Ninguém mais vê seus dados. Leva uns 40 minutos.

**Tem Claude Code?** Abra esta pasta nele e peça: *"instala o app Finanças do Casal pra gente
seguindo o INSTALAR-COM-CLAUDE.md"*. Ele faz quase tudo por você.

Precisa de conta (todas têm plano grátis) em:
[GitHub](https://github.com), [Supabase](https://supabase.com),
[Pluggy](https://dashboard.pluggy.ai) e [Vercel](https://vercel.com).

## 1. Código

Suba este código num repositório **seu** no GitHub (pode ser privado).

## 2. Banco de dados (Supabase)

1. Crie um projeto novo no Supabase.
2. No seu computador, na pasta do projeto, rode:
   ```bash
   bash scripts/instalacao-sql.sh | pbcopy
   ```
   Isso copia todo o SQL de instalação (no Linux/Windows, troque `| pbcopy` por `> instalar.sql` e abra o arquivo).
3. No Supabase: **SQL Editor → New query**, cole e clique em **Run**.
4. **Authentication → Email Templates**: o login é por código de 6 dígitos, então o
   e-mail precisa mostrar o código. Nos modelos **Confirm signup** e **Magic Link**,
   troque o corpo por algo como:
   ```html
   <h2>Seu código do Finanças do Casal</h2>
   <p>{{ .Token }}</p>
   ```
5. Guarde três coisas de **Project Settings → API**: a URL do projeto, a
   *publishable key* e a *service_role key*.

## 3. Pluggy

1. Em [dashboard.pluggy.ai](https://dashboard.pluggy.ai), crie uma aplicação.
2. Guarde o **Client ID** e o **Client Secret**.

O plano grátis de desenvolvedor tem limite de conexões. Confira no painel se ele
cobre as contas de vocês duas.

## 4. Site (Vercel)

1. Na Vercel: **Add New → Project**, escolha o seu repositório.
2. Em **Environment Variables**, preencha o que está em [.env.example](.env.example):
   - Supabase e Pluggy: o que você guardou nos passos 2 e 3.
   - `PLUGGY_WEBHOOK_SECRET`: invente um texto comprido qualquer.
   - Nomes e e-mails de vocês duas (`NEXT_PUBLIC_PESSOA1_NOME`, `PESSOA1_EMAIL`…).
   - `NOMES_DO_CASAL`: como os nomes completos aparecem no extrato, ex.
     `maria silva, joana souza`. É o que faz um Pix entre vocês não virar gasto.
   - Deixe `HOUSEHOLD_OWNER_ID` e `NEXT_PUBLIC_APP_URL` vazios por enquanto.
3. Clique em **Deploy**. No fim, copie a URL do site (ex. `https://financas-do-casal.vercel.app`).

## 5. Ligar as pontas

1. No Supabase: **Authentication → URL Configuration**. Coloque a URL do site em
   **Site URL** e também em **Redirect URLs**.
2. Abra o site e entre com o e-mail da **pessoa 1**.
3. No Supabase: **Authentication → Users**. Copie o **User ID** dela.
4. Na Vercel, preencha:
   - `HOUSEHOLD_OWNER_ID` = esse User ID
   - `NEXT_PUBLIC_APP_URL` = a URL do site

   Depois vá em **Deployments → ⋯ → Redeploy**.
5. Com a pessoa 1 logada, abra `https://SEU-SITE/api/pluggy/register-webhook`.
   Isso avisa a Pluggy pra mandar os lançamentos novos pro seu site.
6. A **pessoa 2** entra no site uma vez com o e-mail dela. Depois rode no
   SQL Editor (trocando o e-mail):
   ```sql
   insert into household_partners (partner_id)
   select id from auth.users where email = 'email-da-pessoa-2@exemplo.com';
   ```
   Pronto, ela passa a ver os mesmos dados.

> Importante: não conecte banco nenhum antes do passo 5.4. Sem o
> `HOUSEHOLD_OWNER_ID`, as contas ficam salvas no lugar errado.

## 6. Usar

Em **Configurações → Contas**, conecte os bancos. Em cada conta, diga de quem ela é
(pessoa 1, pessoa 2 ou compartilhada). O app aprende as categorias e divisões conforme
vocês revisam os gastos.

## Opcional: e-mails automáticos

O app manda avisos por e-mail (conta vencendo, ritmo do mês, Pix sem nome). Pra ligar:

1. Crie uma conta no [Resend](https://resend.com) e uma API key → `RESEND_API_KEY` na Vercel.
2. Invente um texto comprido → `CRON_SECRET` na Vercel. Redeploy.
3. No Supabase, **Database → Extensions**: ative `pg_cron` e `pg_net`.
4. No SQL Editor (troque a URL e o segredo):
   ```sql
   select cron.schedule('contas-fixas', '0 12 * * *', $$
     select net.http_post('https://SEU-SITE/api/cron/contas-fixas',
       headers := '{"x-cron-secret": "SEU_CRON_SECRET"}'::jsonb)
   $$);
   select cron.schedule('ritmo', '0 13 * * *', $$
     select net.http_post('https://SEU-SITE/api/cron/ritmo',
       headers := '{"x-cron-secret": "SEU_CRON_SECRET"}'::jsonb)
   $$);
   select cron.schedule('nomes-misteriosos', '0 12 * * 1', $$
     select net.http_post('https://SEU-SITE/api/cron/nomes-misteriosos',
       headers := '{"x-cron-secret": "SEU_CRON_SECRET"}'::jsonb)
   $$);
   ```
   Os horários são UTC (12h UTC = 9h em Brasília).

Sem domínio verificado no Resend, os e-mails só chegam no e-mail de quem criou a conta no Resend.
