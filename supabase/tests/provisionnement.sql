-- Vérifie les critères d'acceptation du ticket 06.
--
-- Comme isolation.sql : tout dans une transaction annulée à la fin, aucune
-- donnée laissée derrière, échec bruyant à la première assertion fausse.
--
--   npm run db:test:provisionnement
--   ou collé tel quel dans l'éditeur SQL du tableau de bord.

begin;

\set compte '33333333-3333-3333-3333-333333333333'

-- ---------------------------------------------------------------------------
-- Critère 1 : un compte neuf arrive sur une liste, sans étape intermédiaire
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'compte', 'authenticated',
        'authenticated', 'neuf@test.local', now(), now());

do $$
declare
  n integer;
  nom text;
begin
  select count(*) into n from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'compte neuf : % profil(s), attendu 1', n; end if;

  select count(*) into n from public.lists where owner_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'compte neuf : % liste(s), attendu 1', n; end if;

  select lists.name into nom from public.lists
   where owner_id = '33333333-3333-3333-3333-333333333333';
  if nom <> 'Ostoslista' then raise exception 'liste nommée %, attendu Ostoslista', nom; end if;
end $$;

-- Ce que voit l'application : la requête du composant serveur, jouée avec
-- l'identité du compte et donc à travers RLS. C'est elle qui doit renvoyer une
-- liste, pas la table vue par le propriétaire de la base.
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  select count(*) into n from public.lists;
  if n <> 1 then raise exception 'vue par le compte lui-même : % liste(s), attendu 1', n; end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- Critère 2 : le déclencheur rejoué ne crée pas de seconde liste
-- ---------------------------------------------------------------------------

-- Un compte ne s'insère pas deux fois dans `auth.users`, la clé primaire s'y
-- oppose. Pour rejouer réellement le corps de la fonction, on l'accroche à une
-- table temporaire : elle ne lit de `new` que `id`, donc le rejeu est fidèle.
create temporary table rejeu (id uuid) on commit drop;

create trigger rejeu_provisionnement
  after insert on rejeu
  for each row execute function public.provisionner_compte();

insert into rejeu (id) values (:'compte');
insert into rejeu (id) values (:'compte');

do $$
declare n integer;
begin
  select count(*) into n from public.lists where owner_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'après rejeu : % liste(s), attendu 1', n; end if;

  select count(*) into n from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'après rejeu : % profil(s), attendu 1', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Critère 3 : supprimer le compte nettoie ses lignes
-- ---------------------------------------------------------------------------

insert into public.list_items (list_id, raw_fr, position)
select id, 'tomates', 0 from public.lists
 where owner_id = :'compte';

insert into public.mcp_tokens (user_id, token_hash, prefix)
values (:'compte', 'hachage-du-compte-neuf', 'kori_c');

delete from auth.users where id = :'compte';

do $$
declare n integer;
begin
  select count(*) into n from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  if n <> 0 then raise exception 'après suppression : % profil(s) restant(s)', n; end if;

  select count(*) into n from public.lists where owner_id = '33333333-3333-3333-3333-333333333333';
  if n <> 0 then raise exception 'après suppression : % liste(s) restante(s)', n; end if;

  select count(*) into n from public.mcp_tokens where user_id = '33333333-3333-3333-3333-333333333333';
  if n <> 0 then raise exception 'après suppression : % jeton(s) restant(s)', n; end if;

  -- Les items descendent de la liste, pas du compte : c'est la cascade de
  -- `lists` qui doit les emporter. Le vérifier séparément, sinon un jour où
  -- `list_items` pendrait d'autre chose, personne ne le verrait.
  select count(*) into n from public.list_items where raw_fr = 'tomates';
  if n <> 0 then raise exception 'après suppression : % item(s) orphelin(s)', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Le rattrapage est rejouable
-- ---------------------------------------------------------------------------

-- Une migration se rejoue sur une base déjà migrée, par exemple en repartant
-- d'une sauvegarde. Le bloc de rattrapage ne doit rien créer la seconde fois.

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'compte', 'authenticated',
        'authenticated', 'neuf@test.local', now(), now());

insert into public.profiles (id) select users.id from auth.users on conflict (id) do nothing;

insert into public.lists (owner_id, name)
select users.id, 'Ostoslista' from auth.users users
where not exists (select 1 from public.lists where lists.owner_id = users.id);

do $$
declare n integer;
begin
  select count(*) into n from public.lists where owner_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'rattrapage rejoué : % liste(s), attendu 1', n; end if;
end $$;

\echo 'provisionnement : tous les critères du ticket 06 sont vérifiés'

rollback;
