delete from public.todos
where organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191'
  and id in (
    '92847361-b238-4b7f-bdfd-ecc7cccffaec',
    '7b4f608b-b9e8-4274-8d77-a81b13ac9cb9',
    '25d45060-256e-4212-a82b-ed171bfbcb3b'
  );