# Roteiro de instalação para o Claude Code

> **Pessoa:** abra esta pasta no Claude Code e escreva
> *"instala o app Finanças do Casal pra gente seguindo o INSTALAR-COM-CLAUDE.md"*.
> Antes, instale a extensão **Claude in Chrome** e deixe o Chrome aberto.

---

**Claude, este roteiro é pra você.** Faça a instalação inteira pela pessoa usando o
terminal e o Chrome (Claude in Chrome). O guia manual, com o porquê de cada passo,
está em [INSTALAR.md](INSTALAR.md).

Como trabalhar:
- A pessoa não é técnica. Fale pouco, em português, e diga exatamente onde clicar.
- Faça uma etapa por vez e confirme que deu certo antes de passar pra próxima.
- **Chaves e segredos passam pelo terminal, não por formulário no navegador.** No
  Chrome, você só abre as páginas e mostra onde está cada coisa.
- Você conduz os cadastros das contas passo a passo (seção 2). Senhas, códigos e
  "não sou um robô" são sempre com ela.
- Guarde tudo que for coletando em `.env.local` (modelo em `.env.example`). Nunca
  faça commit desse arquivo.

## 0. Conferir as ferramentas

Confira se `node`, `npm`, `supabase` e `vercel` estão instalados. O que faltar,
instale (`brew install supabase/tap/supabase`, `npm i -g vercel`). Depois rode `npm install`.

## 1. Perguntar sobre o casal

Pergunte, uma coisa de cada vez:
- o nome e o e-mail de cada uma (a **pessoa 1** é quem vai conectar os bancos e ser a dona dos dados);
- como o nome completo de cada uma aparece no extrato (ex. `maria silva`), pra preencher `NOMES_DO_CASAL`.

## 2. Contas

Você conduz o cadastro do começo ao fim. Ela só digita a senha, digita os códigos
de confirmação, resolve o "não sou um robô" e clica no botão final de criar conta.

Como conduzir cada cadastro:
1. Abra a página no Chrome e tire um screenshot.
2. Diga, em uma frase, o que ela vai fazer agora ("clica em *Continue with Google*").
3. Espere ela dizer que fez e tire outro screenshot pra conferir onde ela está.
4. Se aparecer algo inesperado (pop-up, plano pago, pesquisa), diga o que escolher.
   Sempre o plano **grátis** e nenhum cartão de crédito. Pesquisa de "como nos
   conheceu" pode pular ou responder qualquer coisa.
5. Se ela preferir cadastro com e-mail, peça permissão antes de digitar o nome e o
   e-mail dela nos campos. Senha, nunca: o campo de senha é sempre ela.
6. Quando chegar e-mail de confirmação, peça pra ela abrir o e-mail e clicar no link
   ou te dizer que confirmou. Não leia a caixa de entrada dela.

Sempre sugira **"Continue with Google"** (ou GitHub), quando existir. Assim não tem
senha nova nem e-mail de confirmação.

### Supabase
1. Abra https://supabase.com/dashboard/sign-up. Mostre o botão de Google/GitHub.
2. Depois do login, se pedir pra criar uma organização: nome `Financas do Casal`, tipo
   **Personal**, plano **Free**. Não crie projeto pelo site: você faz isso no passo 3.

### Vercel
1. Abra https://vercel.com/signup.
2. Tipo de uso: **Hobby** (pessoal, grátis). Nome: o dela.
3. Mostre o botão de Google/GitHub/e-mail.
4. Se pedir pra importar um repositório do GitHub, **pule** ("Skip" ou volte ao
   dashboard). O deploy é feito pelo terminal no passo 5.

### Pluggy
1. Abra https://dashboard.pluggy.ai e procure "Sign up" / "Criar conta".
2. Esse cadastro costuma pedir nome, e-mail, empresa e telefone. Em empresa, ela
   pode pôr o próprio nome ou "Pessoal". Peça permissão antes de preencher cada campo
   com dados dela. Senha e telefone ela digita.
3. Confirme o e-mail (ela clica no link) e entre no painel.
4. Se o painel oferecer ambiente **Sandbox** e **Production**, explique: sandbox é
   banco de mentira pra teste. Pra conectar os bancos de verdade, a aplicação precisa
   de acesso a produção. Ajude a achar essa opção e o que ela pede. Se exigir algo
   que ela não tem (CNPJ, contrato), pare e explique antes de continuar.

Só siga pro próximo serviço quando ela estiver logada no painel do anterior.

## 3. Supabase (pelo terminal)

1. `supabase login` abre o navegador. Peça pra ela autorizar.
2. `supabase orgs list` e `supabase projects create financas-do-casal --org-id <ID> --region sa-east-1 --db-password <senha forte gerada por você>`.
   Guarde o `project-ref`.
3. `supabase link --project-ref <REF>`.
4. Monte o banco:
   `bash scripts/instalacao-sql.sh > /tmp/instalar.sql && supabase db query --linked -f /tmp/instalar.sql`.
5. Rode `supabase projects api-keys --project-ref <REF>` pra pegar as chaves. A anon (ou a
   publishable) vai em `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, e a service_role vai em
   `SUPABASE_SERVICE_ROLE_KEY`. A URL é `https://<REF>.supabase.co`.

## 4. Pluggy (a única chave que vem pelo navegador)

1. No Chrome, abra https://dashboard.pluggy.ai, ache a aplicação (crie uma se não
   existir) e mostre pra ela onde ficam o **Client ID** e o **Client Secret**.
2. Peça pra ela copiar e colar os dois aqui no chat. Grave no `.env.local`.
3. Gere um `PLUGGY_WEBHOOK_SECRET` aleatório.

## 5. Primeiro deploy (Vercel)

1. `vercel login` e peça pra ela autorizar no navegador.
2. `vercel link --yes` cria o projeto a partir desta pasta. Não precisa de GitHub.
3. Cadastre cada variável do `.env.local`, menos `HOUSEHOLD_OWNER_ID` e `NEXT_PUBLIC_APP_URL`:
   `printf '%s' "<valor>" | vercel env add <NOME> production`.
4. `vercel deploy --prod`. Guarde a URL de produção.

## 6. Configurar o login (Chrome)

O login é por código de 6 dígitos. Antes de abrir qualquer página, avise o que vai
mudar e espere ela dizer que pode.
1. Abra `https://supabase.com/dashboard/project/<REF>/auth/templates`. Nos modelos
   **Confirm signup** e **Magic Link**, troque o corpo por
   `<h2>Seu código do Finanças do Casal</h2><p>{{ .Token }}</p>` e salve.
2. Abra `https://supabase.com/dashboard/project/<REF>/auth/url-configuration`.
   Coloque a URL de produção em **Site URL** e em **Redirect URLs**, e salve.

## 7. Ligar as pontas

1. Peça pra **pessoa 1** abrir a URL do site e entrar com o e-mail dela.
2. Pegue o ID dela:
   `supabase db query --linked "select id from auth.users where email = '<email1>'"`.
3. Cadastre `HOUSEHOLD_OWNER_ID` (esse ID) e `NEXT_PUBLIC_APP_URL` (a URL) na Vercel.
   Depois rode `vercel deploy --prod` de novo.
4. No Chrome, com a pessoa 1 logada, abra `<URL>/api/pluggy/register-webhook`. Tem que responder sem erro.
5. Peça pra **pessoa 2** entrar no site uma vez. Depois rode:
   `supabase db query --linked "insert into household_partners (partner_id) select id from auth.users where email = '<email2>'"`.

Só agora a pessoa 1 conecta os bancos, em **Configurações → Contas**. Ajude a marcar
de quem é cada conta.

## 8. E-mails automáticos (pergunte se ela quer)

Se ela quiser, peça pra criar conta em https://resend.com. Abra no Chrome a página de
API Keys, peça pra ela colar a chave aqui e siga a seção "Opcional: e-mails automáticos"
do [INSTALAR.md](INSTALAR.md), rodando o SQL com `supabase db query --linked`.

## Fim

Diga a URL do site e confira se as duas conseguem entrar. Apague `/tmp/instalar.sql`.
