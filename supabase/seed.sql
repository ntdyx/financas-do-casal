-- Categorias base (user_id NULL). A usuária pode criar novas pela UI.
insert into categories (name, emoji, color) values
  ('Mercado',     '🛒', '#22c55e'),
  ('Alimentação', '🍔', '#f97316'),
  ('Delivery',    '🛵', '#f43f5e'),
  ('Transporte',  '🚗', '#3b82f6'),
  ('Saúde',       '💊', '#ef4444'),
  ('Moradia',     '🏠', '#a855f7'),
  ('Assinaturas', '📺', '#ec4899'),
  ('Educação',    '📚', '#14b8a6'),
  ('Roupas',      '👕', '#eab308'),
  ('Lazer',       '🎉', '#8b5cf6'),
  ('Investimento','📈', '#0d9488'),
  ('Transferências','🔁', '#64748b'),
  ('Compras online','🛍️', '#06b6d4'),
  ('Outros',      '📦', '#71717a')
on conflict (name) do nothing;
