-- Schéma initial de Kori : profils, listes, items, lexique et jetons de
-- connecteur. Le modèle complet est posé d'un coup, y compris les tables que
-- les lots M2 et M3 utiliseront : migrer une base vide coûte moins cher que
-- migrer une base pleine.
--
-- Toutes les tables naissent avec RLS activée et leurs politiques, dans cette
-- même migration. Voir docs/CADRAGE.md pour le modèle et les décisions D1 à D6.

-- ---------------------------------------------------------------------------
-- Type des rayons
-- ---------------------------------------------------------------------------

-- L'ordre de déclaration n'est pas cosmétique : un type énuméré Postgres se
-- trie dans son ordre de déclaration. Cette liste suit le parcours du magasin,
-- donc `order by aisle` donnera directement l'ordre des rayons attendu par le
-- ticket 17, sans table de correspondance.
create type public.aisle as enum (
  'produce',
  'bakery',
  'meat',
  'fish',
  'dairy',
  'pantry',
  'frozen',
  'drinks',
  'household',
  'hygiene',
  'other'
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Un enregistrement par compte. Le profil est provisionné au ticket 06.';

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Pas de politique de suppression : un compte se supprime depuis `auth.users`,
-- et la cascade s'occupe du profil.

-- ---------------------------------------------------------------------------
-- lists
-- ---------------------------------------------------------------------------

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

comment on table public.lists is
  'Une liste par compte en v1 ; la table en permet plusieurs plus tard.';

-- Indispensable aux politiques ci-dessous autant qu'aux requêtes : sans lui,
-- chaque vérification RLS balaierait la table.
create index lists_owner_id_idx on public.lists (owner_id);

alter table public.lists enable row level security;

create policy "lists_select_own"
  on public.lists for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "lists_insert_own"
  on public.lists for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "lists_update_own"
  on public.lists for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "lists_delete_own"
  on public.lists for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- terms, le lexique global
-- ---------------------------------------------------------------------------

create table public.terms (
  id            uuid primary key default gen_random_uuid(),
  fr            text not null,
  fr_normalized text not null unique,
  fi            text not null,
  aisle         public.aisle not null default 'other',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.terms is
  'Lexique global partagé entre tous les comptes (décision D2). Une traduction '
  'ajoutée par un utilisateur profite aux suivants.';

comment on column public.terms.fr_normalized is
  'Forme normalisée de `fr`, écrite par normalize() dans src/lib/terms.ts. '
  'La contrainte d''unicité est la seule garantie contre les doublons : une '
  'vérification applicative préalable laisse une fenêtre entre le select et '
  'l''insert. Le ticket 18 rend la règle SQL équivalente à la règle TypeScript.';

-- `created_by` est mis à null si le compte disparaît : le lexique est global,
-- il survit au départ de celui qui l'a enrichi.

alter table public.terms enable row level security;

create policy "terms_select_authenticated"
  on public.terms for select to authenticated
  using (true);

create policy "terms_insert_authenticated"
  on public.terms for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Volontairement aucune politique d'update ni de delete. Sans politique,
-- l'opération est refusée : le lexique s'enrichit, il ne se réécrit pas et ne
-- se vide pas. Une correction de traduction demandera une décision explicite
-- au ticket 14, pas un oubli de politique aujourd'hui.

-- ---------------------------------------------------------------------------
-- list_items
-- ---------------------------------------------------------------------------

create table public.list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  term_id    uuid references public.terms (id) on delete set null,
  raw_fr     text not null,
  quantity   text,
  checked    boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.list_items is
  'Un item sans `term_id` est un item dont la traduction manque. C''est le '
  'seul état à gérer, il n''y a pas de file d''attente séparée.';

create index list_items_list_id_idx on public.list_items (list_id);

alter table public.list_items enable row level security;

-- list_items ne porte pas de colonne propriétaire : les politiques remontent à
-- `lists.owner_id`. Ne jamais supposer qu'un filtre applicatif sur `list_id`
-- suffira, c'est justement ce que cette barrière rattrape.
create policy "list_items_select_own"
  on public.list_items for select to authenticated
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.owner_id = (select auth.uid())
    )
  );

create policy "list_items_insert_own"
  on public.list_items for insert to authenticated
  with check (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.owner_id = (select auth.uid())
    )
  );

create policy "list_items_update_own"
  on public.list_items for update to authenticated
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.owner_id = (select auth.uid())
    )
  );

create policy "list_items_delete_own"
  on public.list_items for delete to authenticated
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- mcp_tokens
-- ---------------------------------------------------------------------------

create table public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  prefix       text not null,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

comment on table public.mcp_tokens is
  'Jetons du connecteur (décision D3). Stockés hachés : la valeur en clair '
  'n''est montrée qu''une fois, à la génération.';

comment on column public.mcp_tokens.prefix is
  'Quelques caractères de tête, en clair, pour que l''utilisateur reconnaisse '
  'un jeton dans la liste sans qu''on ait à stocker le jeton lui-même.';

create index mcp_tokens_user_id_idx on public.mcp_tokens (user_id);

alter table public.mcp_tokens enable row level security;

create policy "mcp_tokens_select_own"
  on public.mcp_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy "mcp_tokens_insert_own"
  on public.mcp_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "mcp_tokens_update_own"
  on public.mcp_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "mcp_tokens_delete_own"
  on public.mcp_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- La route du connecteur lit cette table avec la clé secrète, qui contourne
-- RLS. Ces politiques ne la protègent donc pas : c'est le code de la route qui
-- doit filtrer explicitement sur `user_id`. Voir .claude/rules/route-mcp.md.
