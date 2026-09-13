-- Vérifie les critères d'acceptation du ticket 03.
--
-- Tout se déroule dans une transaction annulée à la fin : le script ne laisse
-- aucune donnée derrière lui et peut donc être exécuté sans risque, y compris
-- sur une base réelle. Il échoue bruyamment à la première assertion fausse.
--
--   supabase db reset && psql "$DB_URL" -f supabase/tests/isolation.sql
--   ou collé tel quel dans l'éditeur SQL du tableau de bord.

begin;

-- ---------------------------------------------------------------------------
-- Deux comptes de test
-- ---------------------------------------------------------------------------

\set utilisateur_a '11111111-1111-1111-1111-111111111111'
\set utilisateur_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'utilisateur_a', 'authenticated',
   'authenticated', 'a@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'utilisateur_b', 'authenticated',
   'authenticated', 'b@test.local', now(), now());

-- Profils et listes ne sont plus insérés ici : depuis le ticket 06, le
-- déclencheur `provisionner_compte` sur `auth.users` les a déjà créés au
-- moment de l'insertion ci-dessus. Les insérer une seconde fois ferait échouer
-- le script sur la clé primaire de `profiles`, et donnerait deux listes au
-- compte A — ce que les comptages plus bas interdisent justement.
--
-- Les listes reçoivent ici des identifiants fixes, parce que psql n'interpole
-- pas ses variables à l'intérieur d'un bloc `do $$ ... $$` : les assertions qui
-- suivent ont besoin d'écrire l'identifiant de la liste de B en toutes lettres,
-- et A n'a par construction aucun moyen de le lire.
update public.lists set id = 'aaaaaaaa-0000-0000-0000-000000000001'
 where owner_id = :'utilisateur_a';
update public.lists set id = 'bbbbbbbb-0000-0000-0000-000000000001'
 where owner_id = :'utilisateur_b';

-- Données de départ, insérées en tant que propriétaire de la base, donc sans
-- passer par RLS. C'est le seul endroit du script où c'est le cas.
insert into public.list_items (list_id, raw_fr, position) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'tomates', 0),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'maito', 0);

insert into public.mcp_tokens (user_id, token_hash, prefix) values
  (:'utilisateur_a', 'hachage-de-a', 'kori_a'),
  (:'utilisateur_b', 'hachage-de-b', 'kori_b');

-- Deux termes de test, un par compte. Leurs formes normalisées ne peuvent pas
-- entrer en collision avec le lexique réel : ce test doit rester juste sur une
-- base déjà peuplée par `npm run seed:terms`.
insert into public.terms (fr, fr_normalized, fi, aisle, created_by) values
  ('zzz test a', 'zzz test a', 'zzz testi a', 'produce', :'utilisateur_a'),
  ('zzz test b', 'zzz test b', 'zzz testi b', 'produce', :'utilisateur_b');

-- ---------------------------------------------------------------------------
-- Critère 1 : le compte A n'obtient aucune ligne du compte B
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.lists;
  if n <> 1 then raise exception 'A voit % listes, attendu 1', n; end if;

  select count(*) into n from public.lists where owner_id <> auth.uid();
  if n <> 0 then raise exception 'A voit % listes d''un autre compte', n; end if;

  select count(*) into n from public.list_items;
  if n <> 1 then raise exception 'A voit % items, attendu 1', n; end if;

  select count(*) into n from public.mcp_tokens;
  if n <> 1 then raise exception 'A voit % jetons, attendu 1', n; end if;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'A voit % profils, attendu 1', n; end if;

  select count(*) into n from public.profiles where id <> auth.uid();
  if n <> 0 then raise exception 'A voit le profil d''un autre compte'; end if;

  -- Le lexique est global et partagé, c'est voulu (décision D2). A doit voir
  -- son terme comme celui de B. On compte les deux témoins plutôt que la table
  -- entière, dont la taille dépend du seed.
  select count(*) into n from public.terms where fr_normalized like 'zzz test%';
  if n <> 2 then raise exception 'A voit % termes de test sur 2, le lexique doit être partagé', n; end if;
end $$;

-- A ne doit pas pouvoir écrire dans la liste de B.
do $$
begin
  insert into public.list_items (list_id, raw_fr, position)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'intrusion', 1);
  raise exception 'A a pu insérer un item dans la liste de B';
exception
  when insufficient_privilege then null;  -- attendu
end $$;

-- A ne doit pas pouvoir créer un profil au nom de B.
do $$
begin
  insert into public.profiles (id)
  values ('22222222-2222-2222-2222-222222222222');
  raise exception 'A a pu créer un profil au nom de B';
exception
  when insufficient_privilege then null;  -- attendu
  when unique_violation then
    raise exception 'A a atteint la ligne de B : la contrainte a parlé avant RLS';
end $$;

-- Ni voler une liste en la réattribuant.
do $$
declare n integer;
begin
  update public.lists set owner_id = auth.uid()
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'A a réattribué % liste(s) de B', n; end if;
end $$;

-- Ni supprimer les items de B.
do $$
declare n integer;
begin
  delete from public.list_items
   where list_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'A a supprimé % item(s) de B', n; end if;
end $$;

-- Symétrie : B non plus ne voit rien de A.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare n integer;
begin
  select count(*) into n from public.lists where owner_id <> auth.uid();
  if n <> 0 then raise exception 'B voit % listes d''un autre compte', n; end if;
  select count(*) into n from public.list_items;
  if n <> 1 then raise exception 'B voit % items, attendu 1', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Critère 2 : l'unicité sur fr_normalized rejette un doublon
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.terms (fr, fr_normalized, fi, created_by)
  values ('Zzz Test A', 'zzz test a', 'zzz testi a', auth.uid());
  raise exception 'un doublon sur fr_normalized a été accepté';
exception
  when unique_violation then null;  -- attendu
end $$;

-- Le lexique s'enrichit mais ne se réécrit pas : aucune politique d'update ni
-- de delete n'existe, donc les deux doivent être sans effet.
do $$
declare n integer;
begin
  update public.terms set fi = 'detourne' where fr_normalized = 'zzz test a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'le lexique a pu être modifié (% ligne(s))', n; end if;

  delete from public.terms where fr_normalized = 'zzz test a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'le lexique a pu être vidé (% ligne(s))', n; end if;
end $$;

-- Et l'insertion d'un terme au nom d'un autre compte doit être refusée.
do $$
begin
  insert into public.terms (fr, fr_normalized, fi, created_by)
  values ('zzz test c', 'zzz test c', 'zzz testi c', '11111111-1111-1111-1111-111111111111');
  raise exception 'B a pu insérer un terme au nom de A';
exception
  when insufficient_privilege then null;  -- attendu
end $$;

-- ---------------------------------------------------------------------------
-- RLS active sur les cinq tables
-- ---------------------------------------------------------------------------

reset role;

do $$
declare manquantes text;
begin
  select string_agg(relname, ', ') into manquantes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;
  if manquantes is not null then
    raise exception 'tables sans RLS : %', manquantes;
  end if;
end $$;

rollback;

\echo 'OK : isolation entre comptes, unicité du lexique et RLS vérifiées.'
