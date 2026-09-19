# Gastadeiras

App de finanças pra casal. Ele puxa os lançamentos dos bancos pela
[Pluggy](https://pluggy.ai) e ajuda vocês a:

- categorizar e dividir cada gasto (100% de uma, 50/50, 75/25), aprendendo com as correções;
- ver quem deve pra quem no fim do mês;
- definir um teto mensal e acompanhar o ritmo do mês;
- controlar contas fixas, parcelas e faturas;
- receber avisos por e-mail (conta vencendo, ritmo estourando).

Cada casal roda a **própria cópia**: o banco de dados (Supabase), a conta na Pluggy
e o site (Vercel) são de vocês. Ninguém mais vê os dados.

## Instalar

- **Com Claude Code:** abra esta pasta nele e peça
  *"instala o Gastadeiras pra gente seguindo o INSTALAR-COM-CLAUDE.md"*.
- **Na mão:** siga o [INSTALAR.md](INSTALAR.md).

## Pra quem vai mexer no código

- Next.js 16 + Supabase + Tailwind. `npm run dev` pra rodar local.
- Os nomes do casal vêm das variáveis de ambiente (veja `.env.example` e `src/lib/casal.ts`).
- No banco, o dono de cada conta é `me` (pessoa 1), `pessoa2` ou `shared`, e
  `split_mine_pct` é a parte da pessoa 1.
- Testes: `node --test --experimental-strip-types src/**/*.test.ts`.
