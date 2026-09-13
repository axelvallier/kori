-- Provisionnement d'un compte neuf : un profil, puis une liste nommée
-- « Ostoslista » (« liste de courses » en finnois).
--
-- Pourquoi un déclencheur et pas du code applicatif : la création du compte se
-- fait dans `auth.users`, une table que l'application ne touche jamais. Un
-- compte peut aussi naître d'un lien magique reçu sur un autre appareil, du
-- tableau de bord Supabase, ou plus tard du connecteur. Le seul endroit par où
-- ils passent tous est l'insertion dans `auth.users`.
--
-- Voir docs/tickets/06-liste-par-defaut.md.

-- ---------------------------------------------------------------------------
-- La fonction
-- ---------------------------------------------------------------------------

create or replace function public.provisionner_compte()
returns trigger
language plpgsql
security definer
-- `search_path` vide et noms qualifiés partout. Sans cela, une fonction
-- `security definer` exécute ce que le chemin de recherche de l'appelant lui
-- présente : il suffirait d'une table `profiles` dans un schéma que l'appelant
-- contrôle pour détourner l'insertion.
set search_path = ''
as $$
begin
  -- `on conflict do nothing` plutôt qu'un `if not exists` préalable : entre le
  -- test et l'insertion il y a une fenêtre, alors que la clé primaire, elle,
  -- ne se trompe jamais. Le déclencheur rejoué ne crée donc pas de doublon.
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  -- Pas de contrainte d'unicité équivalente sur `lists` : le modèle prévoit
  -- explicitement plusieurs listes par compte plus tard (voir CADRAGE.md), et
  -- un index unique sur `owner_id` fermerait cette porte. La garde est donc
  -- écrite ici, sur la seule opération qui doit rester unique : le
  -- provisionnement de la première liste.
  insert into public.lists (owner_id, name)
  select new.id, 'Ostoslista'
  where not exists (
    select 1 from public.lists where lists.owner_id = new.id
  );

  return new;
end;
$$;

comment on function public.provisionner_compte() is
  'Crée le profil et la liste par défaut d''un compte neuf. Idempotente : '
  'rejouée sur un compte déjà provisionné, elle ne crée rien.';

-- La fonction est exécutée par le déclencheur, jamais appelée directement.
-- `security definer` sans cette restriction offrirait à n'importe quel
-- utilisateur authentifié une fonction tournant avec les droits du
-- propriétaire.
revoke execute on function public.provisionner_compte() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le déclencheur
-- ---------------------------------------------------------------------------

drop trigger if exists provisionner_compte on auth.users;

-- `after insert` et non `before` : si le provisionnement échoue, l'inscription
-- échoue avec lui. C'est voulu. Un compte sans liste arriverait sur un écran
-- vide impossible à réparer depuis l'application, alors qu'une inscription
-- refusée se retente.
create trigger provisionner_compte
  after insert on auth.users
  for each row
  execute function public.provisionner_compte();

-- ---------------------------------------------------------------------------
-- Rattrapage des comptes existants
-- ---------------------------------------------------------------------------

-- Le déclencheur ne vaut que pour l'avenir. Les comptes créés pendant le ticket
-- 05, avant qu'il n'existe, n'ont ni profil ni liste : sans ce rattrapage, ils
-- arriveraient sur l'écran vide que le ticket 06 est censé rendre impossible.
-- `deleted_at` est filtre parce que Supabase supprime en douceur : la ligne
-- reste dans `auth.users` avec cette colonne renseignee. Sans le filtre, un
-- compte supprime a la demande de son proprietaire se reverrait attribuer un
-- profil neuf et une liste « Ostoslista ». Les donnees lui appartiendraient
-- bien, RLS n'est pas en cause — mais ressusciter les donnees d'un compte
-- qu'on a dit avoir efface n'est pas defendable.
--
-- Le declencheur, lui, n'a pas besoin de ce filtre : il ne voit que des
-- insertions, et un compte ne nait pas deja supprime.
insert into public.profiles (id)
select users.id from auth.users users
where users.deleted_at is null
on conflict (id) do nothing;

insert into public.lists (owner_id, name)
select users.id, 'Ostoslista'
from auth.users users
where users.deleted_at is null
  and not exists (
    select 1 from public.lists where lists.owner_id = users.id
  );
