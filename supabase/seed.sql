insert into public.shopping_providers (code, name, enabled)
values
  ('coles', 'Coles', false),
  ('woolworths', 'Woolworths', false),
  ('generic', 'Generic grocery export', false)
on conflict (code) do nothing;
