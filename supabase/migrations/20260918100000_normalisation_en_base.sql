-- La forme normalisée d'un terme ne se dicte plus : la base la calcule.
--
-- Jusqu'ici, `terms.fr_normalized` était une colonne ordinaire, écrite par
-- l'appelant. La politique `terms_insert_authenticated` vérifiait
-- `created_by = auth.uid()` et rien d'autre : n'importe quel compte pouvait
-- insérer `fr = 'zzz', fr_normalized = 'lait'`, réserver ainsi la forme du
-- vrai « lait » et, `terms` n'ayant ni update ni delete, la rendre
-- irréparable sans migration. Le rattachement rétroactif du ticket 14 propage
-- en plus une telle entrée aux listes déjà présentes des autres comptes. Voir
-- D8 et D9 dans docs/CADRAGE.md, et docs/tickets/18-normalisation-partagee.md.
--
-- Deux choses changent, dans cet ordre :
--
--   1. `public.normalize_fr(text)` : la règle de normalisation, en SQL, jumelle
--      de `normalize()` dans src/lib/terms.ts. Étape par étape, dans le même
--      ordre, avec les mêmes listes. `npm run db:test:normalisation` compare
--      les deux sur tous les cas de test et sur tout le lexique.
--
--   2. `fr_normalized` devient une colonne **générée** à partir de `fr`. Une
--      insertion qui la fournit est refusée par Postgres (code 428C9), avant
--      toute politique. L'argument est retiré de la requête au lieu d'être
--      vérifié — c'est ce que le ticket 18 demandait.
--
-- Au passage, la question des accents est tranchée (D9) : ils sont retirés.
-- « crème fraîche » et « creme fraiche » donnent désormais la même forme. Les
-- lignes existantes sont recalculées par la colonne générée elle-même.

-- ---------------------------------------------------------------------------
-- 1. La règle, en SQL
-- ---------------------------------------------------------------------------
--
-- `immutable` est requis pour une colonne générée, et vrai : la fonction ne lit
-- rien d'autre que son argument. `strict` rend null pour null, comme `fr` est
-- `not null` le cas ne se présente pas. `parallel safe` pour la même raison.
--
-- Les échappements `\uXXXX` sont volontaires, comme dans la migration qui
-- borne la forme du lexique : un caractère invisible écrit en clair donne une
-- fonction que personne ne peut relire. Chaque classe correspond, caractère
-- pour caractère, à la constante du même nom dans src/lib/terms.ts.

create or replace function public.normalize_fr(fr text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  s text;
  prefixe text;
  mots text[];
  i integer;
  -- Articles et partitifs retirés en tête. L'ordre compte : les formes les
  -- plus longues d'abord, sinon « de la » serait mangé par « de ».
  prefixes constant text[] := array[
    'de la ', 'de l''', 'des ', 'du ', 'les ', 'le ', 'la ', 'une ', 'un ', 'd''', 'l'''
  ];
  -- Mots qui finissent par s ou x au singulier, ou invariables. Sans accent,
  -- parce que comparés après leur retrait.
  invariables constant text[] := array[
    'ananas', 'anis', 'cassis', 'chips', 'couscous', 'jus', 'mais', 'noix',
    'os', 'pois', 'radis', 'tapas'
  ];
begin
  s := lower(fr);
  -- L'apostrophe typographique des claviers de téléphone.
  s := regexp_replace(s, '[\u2019\u02bc]', '''', 'g');
  -- Les ligatures, que personne ne tape.
  s := replace(replace(s, 'œ', 'oe'), 'æ', 'ae');
  -- Les accents (D9). Table explicite, la même que ACCENTUEES / SANS_ACCENT.
  s := translate(s, 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc');
  -- Ce qui compte comme espace : la même liste que ESPACES, parce que `\s`
  -- n'a pas le même contenu ici et en JavaScript.
  s := btrim(regexp_replace(
    s,
    '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',
    ' ',
    'g'
  ), ' ');

  foreach prefixe in array prefixes loop
    if starts_with(s, prefixe) then
      s := btrim(substr(s, char_length(prefixe) + 1), ' ');
      exit;
    end if;
  end loop;

  -- Le pluriel est retiré sur chaque mot : « tomates cerises » → « tomate cerise ».
  mots := string_to_array(s, ' ');
  for i in 1 .. coalesce(array_length(mots, 1), 0) loop
    if mots[i] = any (invariables) or char_length(mots[i]) <= 3 then
      continue;
    end if;
    mots[i] := regexp_replace(mots[i], '[sx]$', '');
  end loop;

  return btrim(array_to_string(mots, ' '), ' ');
end
$$;

comment on function public.normalize_fr(text) is
  'Forme canonique d''un terme français. Jumelle de normalize() dans '
  'src/lib/terms.ts : toute divergence est un bug. Calcule terms.fr_normalized.';

-- Une fonction du schéma public est exposée en RPC par la Data API. Celle-ci ne
-- lit rien et n'écrit rien, mais elle coûte du processeur, et un appelant sans
-- session n'a aucune raison de la payer à la base. Le rôle `authenticated` la
-- garde : c'est lui qui insère dans `terms`, et l'expression de la colonne
-- générée s'évalue avec ses droits — vérifié par isolation.sql, qui insère
-- sous ce rôle.
revoke all on function public.normalize_fr(text) from public, anon;
grant execute on function public.normalize_fr(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. La colonne générée
-- ---------------------------------------------------------------------------
--
-- Postgres ne sait pas transformer une colonne ordinaire en colonne générée :
-- il faut la retirer et la recréer. Le bloc est gardé par l'état de la
-- colonne, donc rejouable sans effet.

-- Avant de toucher à quoi que ce soit : la nouvelle règle rapproche des
-- formes que l'ancienne distinguait (les accents). Si deux entrées du lexique
-- convergent, la contrainte d'unicité échouerait sur un « duplicate key »
-- illisible. Même politique que la renormalisation des ligatures : échouer
-- bruyamment, nommer les lignes, et laisser un humain trancher — jamais céder
-- une entrée du lexique partagé en silence.
do $$
declare collisions text;
begin
  select string_agg(format('%s → %s', doublons, forme), ' ; ' order by forme)
    into collisions
    from (
      select public.normalize_fr(fr) as forme,
             string_agg(format('« %s »', fr), ' et ' order by fr) as doublons
        from public.terms
       group by public.normalize_fr(fr)
      having count(*) > 1
    ) d;

  if collisions is not null then
    raise exception
      'Normalisation impossible, des entrées du lexique convergent : % . '
      'Vérifier qui les a créées (colonne created_by) avant de trancher.',
      collisions;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'terms'
      and column_name = 'fr_normalized' and is_generated = 'NEVER'
  ) then
    -- kori:destructif fr_normalized est recalculée depuis fr par la colonne générée qui la remplace. Sa seule information propre serait une valeur qui ne correspond pas à fr, c'est-à-dire exactement ce qu'on retire.
    -- Retire avec elle la contrainte d'unicité et la contrainte de forme qui
    -- la portaient ; l'unicité est reposée juste après.
    alter table public.terms drop column fr_normalized;

    alter table public.terms
      add column fr_normalized text
        generated always as (public.normalize_fr(fr)) stored;

    -- Inatteignable en pratique (`fr` est not null et la fonction est
    -- strict), mais `unique` laisse passer plusieurs null : l'invariant est
    -- écrit plutôt que déduit.
    alter table public.terms alter column fr_normalized set not null;

    alter table public.terms
      add constraint terms_fr_normalized_key unique (fr_normalized);
  end if;

  -- Une forme vide serait une entrée que rien ne peut jamais retrouver :
  -- `fr = 'd'''`, par exemple, ne laisse rien derrière le préfixe. `not valid`
  -- pour la même raison que les contraintes de forme du lexique — ne jamais
  -- bloquer la chaîne des migrations sur une ligne déposée avant elle.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.terms'::regclass and conname = 'terms_fr_normalized_non_vide'
  ) then
    alter table public.terms
      add constraint terms_fr_normalized_non_vide check (fr_normalized <> '') not valid;
  end if;
end
$$;

comment on column public.terms.fr_normalized is
  'Forme normalisée de `fr`, générée par normalize_fr() — l''appelant ne la '
  'fournit pas, et ne peut donc plus mentir dessus (ticket 18). Clé d''unicité '
  'du lexique.';
