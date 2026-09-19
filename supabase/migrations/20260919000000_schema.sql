-- Schema completo do Finanças do Casal.
-- Gerado a partir das migrations do app original (não edite à mão: pra mudar o
-- banco, crie uma migration nova depois desta).
--
-- A segunda pessoa do casal ganha acesso aos dados entrando na tabela
-- household_partners (veja INSTALAR.md).

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pluggy_item_id text,
    pluggy_account_id text,
    name text NOT NULL,
    type text NOT NULL,
    balance_cents bigint DEFAULT 0,
    balance_due_date date,
    owner text DEFAULT 'me'::text NOT NULL,
    default_split_mine_pct integer,
    excluded boolean DEFAULT false NOT NULL,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_default_split_mine_pct_check CHECK (((default_split_mine_pct >= 0) AND (default_split_mine_pct <= 100))),
    CONSTRAINT accounts_owner_check CHECK ((owner = ANY (ARRAY['me'::text, 'pessoa2'::text, 'shared'::text]))),
    CONSTRAINT accounts_type_check CHECK ((type = ANY (ARRAY['checking'::text, 'credit'::text])))
);

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    tx_id uuid,
    tx_description text,
    field text,
    before_value jsonb,
    after_value jsonb,
    undone boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor text
);

CREATE TABLE public.bill_nudges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ref text NOT NULL,
    kind text NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '📦'::text NOT NULL,
    color text DEFAULT '#71717a'::text NOT NULL,
    user_id uuid
);

CREATE TABLE public.category_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description_pattern text NOT NULL,
    category_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixed_bill_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixed_bill_marks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    month text NOT NULL,
    note text,
    tx_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fixed_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '📌'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    due_day smallint,
    started_on date,
    ended_on date,
    CONSTRAINT fixed_bills_due_day_range CHECK (((due_day IS NULL) OR ((due_day >= 1) AND (due_day <= 31)))),
    CONSTRAINT fixed_bills_janela_coerente CHECK (((started_on IS NULL) OR (ended_on IS NULL) OR (ended_on >= started_on)))
);

CREATE TABLE public.fixed_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description_pattern text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bill_id uuid
);

CREATE TABLE public.household_partners (
    partner_id uuid NOT NULL
);

CREATE TABLE public.monthly_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    snapshot jsonb NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pace_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.planned_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '💸'::text NOT NULL,
    amount_cents integer NOT NULL,
    recurrence text DEFAULT 'yearly'::text NOT NULL,
    month integer NOT NULL,
    year integer,
    installments integer DEFAULT 1 NOT NULL,
    split_mine_pct integer,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.spend_caps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT spend_caps_amount_cents_check CHECK ((amount_cents > 0))
);

CREATE TABLE public.split_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description_pattern text NOT NULL,
    split_mine_pct integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT split_rules_split_mine_pct_check CHECK (((split_mine_pct >= 0) AND (split_mine_pct <= 100)))
);

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    pluggy_transaction_id text,
    description text NOT NULL,
    amount_cents bigint NOT NULL,
    transaction_date date NOT NULL,
    category_id uuid,
    split_mine_pct integer,
    payer text DEFAULT 'me'::text NOT NULL,
    is_transfer boolean DEFAULT false NOT NULL,
    is_manual boolean DEFAULT false NOT NULL,
    installment_number integer,
    total_installments integer,
    note text,
    reviewed boolean DEFAULT false NOT NULL,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    is_fixed boolean DEFAULT false NOT NULL,
    fixed_bill_id uuid,
    CONSTRAINT transactions_payer_check CHECK ((payer = ANY (ARRAY['me'::text, 'pessoa2'::text]))),
    CONSTRAINT transactions_split_mine_pct_check CHECK (((split_mine_pct >= 0) AND (split_mine_pct <= 100)))
);

CREATE TABLE public.transfer_exceptions (
    user_id uuid NOT NULL,
    description_pattern text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.transfer_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description_pattern text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.categories VALUES ('834e139b-158e-4081-b37c-ba4129bd181c', 'Investimento', '📈', '#0d9488', NULL);

INSERT INTO public.categories VALUES ('eb4094ae-abb3-4c5f-913f-e6505157699c', 'Transferências', '🔁', '#64748b', NULL);

INSERT INTO public.categories VALUES ('8c5ae914-fdde-43ec-b24d-b82ab6ff1eba', 'Compras online', '🛍️', '#06b6d4', NULL);

INSERT INTO public.categories VALUES ('45fcc914-7591-4832-a6e4-12ee9725b8fc', 'Delivery', '🛵', '#f43f5e', NULL);

INSERT INTO public.categories VALUES ('f8a17118-e363-46dd-950a-3e35c6e6c38d', 'IOF', '🧾', '#78716c', NULL);

INSERT INTO public.categories VALUES ('f8d78a8d-4a0f-4138-be42-9bb4427c5b2f', 'Mercado', '🛒', '#22c55e', NULL);

INSERT INTO public.categories VALUES ('2f46b30f-8463-4415-ad06-44b714bc737c', 'Alimentação', '🍔', '#f97316', NULL);

INSERT INTO public.categories VALUES ('25352797-46b1-4ec7-9696-810f8f135d30', 'Transporte', '🚗', '#3b82f6', NULL);

INSERT INTO public.categories VALUES ('8d5d44fe-5b07-499e-961f-de61346bee4e', 'Saúde', '💊', '#ef4444', NULL);

INSERT INTO public.categories VALUES ('d7dc95a5-c8a6-43c1-ad4f-19f1a4a032e1', 'Moradia', '🏠', '#a855f7', NULL);

INSERT INTO public.categories VALUES ('7e7c1567-70c2-4327-926d-d45d7ca3596c', 'Assinaturas', '📺', '#ec4899', NULL);

INSERT INTO public.categories VALUES ('ee9af2ae-c822-4997-b103-e22524ccd107', 'Educação', '📚', '#14b8a6', NULL);

INSERT INTO public.categories VALUES ('d036441f-007d-4b80-9629-8e28d0c0a9d8', 'Roupas', '👕', '#eab308', NULL);

INSERT INTO public.categories VALUES ('1ebdca71-8b5e-42ec-be4b-f6a37e6fe528', 'Lazer', '🎉', '#8b5cf6', NULL);

INSERT INTO public.categories VALUES ('8bfe2656-9fc0-49e9-bad4-50d837c2f6d9', 'Outros', '📦', '#71717a', NULL);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pluggy_account_id_key UNIQUE (pluggy_account_id);

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bill_nudges
    ADD CONSTRAINT bill_nudges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bill_nudges
    ADD CONSTRAINT bill_nudges_user_id_ref_kind_year_month_key UNIQUE (user_id, ref, kind, year, month);

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.category_rules
    ADD CONSTRAINT category_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.category_rules
    ADD CONSTRAINT category_rules_user_id_description_pattern_key UNIQUE (user_id, description_pattern);

ALTER TABLE ONLY public.fixed_bill_alerts
    ADD CONSTRAINT fixed_bill_alerts_bill_id_year_month_key UNIQUE (bill_id, year, month);

ALTER TABLE ONLY public.fixed_bill_alerts
    ADD CONSTRAINT fixed_bill_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fixed_bill_marks
    ADD CONSTRAINT fixed_bill_marks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fixed_bill_marks
    ADD CONSTRAINT fixed_bill_marks_user_id_bill_id_month_key UNIQUE (user_id, bill_id, month);

ALTER TABLE ONLY public.fixed_bills
    ADD CONSTRAINT fixed_bills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fixed_bills
    ADD CONSTRAINT fixed_bills_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE ONLY public.fixed_rules
    ADD CONSTRAINT fixed_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fixed_rules
    ADD CONSTRAINT fixed_rules_user_id_description_pattern_key UNIQUE (user_id, description_pattern);

ALTER TABLE ONLY public.household_partners
    ADD CONSTRAINT household_partners_pkey PRIMARY KEY (partner_id);

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_user_id_year_month_key UNIQUE (user_id, year, month);

ALTER TABLE ONLY public.pace_alerts
    ADD CONSTRAINT pace_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pace_alerts
    ADD CONSTRAINT pace_alerts_user_id_year_month_key UNIQUE (user_id, year, month);

ALTER TABLE ONLY public.planned_bills
    ADD CONSTRAINT planned_bills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.spend_caps
    ADD CONSTRAINT spend_caps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.split_rules
    ADD CONSTRAINT split_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.split_rules
    ADD CONSTRAINT split_rules_user_id_description_pattern_key UNIQUE (user_id, description_pattern);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pluggy_transaction_id_key UNIQUE (pluggy_transaction_id);

ALTER TABLE ONLY public.transfer_exceptions
    ADD CONSTRAINT transfer_exceptions_pkey PRIMARY KEY (user_id, description_pattern);

ALTER TABLE ONLY public.transfer_rules
    ADD CONSTRAINT transfer_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.transfer_rules
    ADD CONSTRAINT transfer_rules_user_id_description_pattern_key UNIQUE (user_id, description_pattern);

CREATE INDEX accounts_user_idx ON public.accounts USING btree (user_id);

CREATE INDEX activity_log_user_idx ON public.activity_log USING btree (user_id, created_at DESC);

CREATE INDEX bill_nudges_mes_idx ON public.bill_nudges USING btree (user_id, year, month);

CREATE INDEX fixed_bill_marks_month_idx ON public.fixed_bill_marks USING btree (user_id, month);

CREATE INDEX planned_bills_user_idx ON public.planned_bills USING btree (user_id);

CREATE INDEX spend_caps_user_idx ON public.spend_caps USING btree (user_id, effective_from);

CREATE UNIQUE INDEX spend_caps_user_month_uniq ON public.spend_caps USING btree (user_id, effective_from);

CREATE INDEX transactions_account_idx ON public.transactions USING btree (account_id);

CREATE INDEX transactions_fixed_bill_idx ON public.transactions USING btree (fixed_bill_id);

CREATE INDEX transactions_pending_idx ON public.transactions USING btree (user_id) WHERE (reviewed = false);

CREATE INDEX transactions_user_cat_idx ON public.transactions USING btree (user_id, category_id);

CREATE INDEX transactions_user_date_idx ON public.transactions USING btree (user_id, transaction_date DESC);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bill_nudges
    ADD CONSTRAINT bill_nudges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.category_rules
    ADD CONSTRAINT category_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.category_rules
    ADD CONSTRAINT category_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_bill_alerts
    ADD CONSTRAINT fixed_bill_alerts_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.fixed_bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_bill_alerts
    ADD CONSTRAINT fixed_bill_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_bill_marks
    ADD CONSTRAINT fixed_bill_marks_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.fixed_bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_bill_marks
    ADD CONSTRAINT fixed_bill_marks_tx_id_fkey FOREIGN KEY (tx_id) REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fixed_bill_marks
    ADD CONSTRAINT fixed_bill_marks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_bills
    ADD CONSTRAINT fixed_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_rules
    ADD CONSTRAINT fixed_rules_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.fixed_bills(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fixed_rules
    ADD CONSTRAINT fixed_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.household_partners
    ADD CONSTRAINT household_partners_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pace_alerts
    ADD CONSTRAINT pace_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.planned_bills
    ADD CONSTRAINT planned_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.spend_caps
    ADD CONSTRAINT spend_caps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.split_rules
    ADD CONSTRAINT split_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_fixed_bill_id_fkey FOREIGN KEY (fixed_bill_id) REFERENCES public.fixed_bills(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transfer_exceptions
    ADD CONSTRAINT transfer_exceptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transfer_rules
    ADD CONSTRAINT transfer_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bill_nudges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_household_partner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from household_partners where partner_id = auth.uid())
$$;

CREATE POLICY "delete own categories" ON public.categories FOR DELETE USING ((auth.uid() = user_id));

ALTER TABLE public.fixed_bill_alerts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fixed_bill_marks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fixed_bills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fixed_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household partner" ON public.accounts USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.activity_log USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.bill_nudges USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.category_rules USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.fixed_bill_alerts USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.fixed_bill_marks USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.fixed_bills USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.fixed_rules USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.monthly_closings USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.pace_alerts USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.planned_bills USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.spend_caps USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.split_rules USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.transactions USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

CREATE POLICY "household partner" ON public.transfer_exceptions USING (public.is_household_partner()) WITH CHECK (public.is_household_partner());

ALTER TABLE public.household_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own categories" ON public.categories FOR INSERT WITH CHECK ((auth.uid() = user_id));

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own accounts" ON public.accounts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own activity_log" ON public.activity_log USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own bill_nudges" ON public.bill_nudges USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own category_rules" ON public.category_rules USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own closings" ON public.monthly_closings USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own fixed_bill_alerts" ON public.fixed_bill_alerts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own fixed_bill_marks" ON public.fixed_bill_marks USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own fixed_bills" ON public.fixed_bills USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own fixed_rules" ON public.fixed_rules USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own pace_alerts" ON public.pace_alerts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own planned_bills" ON public.planned_bills USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own spend_caps" ON public.spend_caps USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own split_rules" ON public.split_rules USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own transactions" ON public.transactions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own transfer_exceptions" ON public.transfer_exceptions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "own transfer_rules" ON public.transfer_rules USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

ALTER TABLE public.pace_alerts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.planned_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read categories" ON public.categories FOR SELECT USING (true);

ALTER TABLE public.spend_caps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.split_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transfer_exceptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transfer_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "update own categories" ON public.categories FOR UPDATE USING ((auth.uid() = user_id));
