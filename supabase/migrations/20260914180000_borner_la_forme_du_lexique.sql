-- Borne la **forme** des entrées du lexique : longueur, et une seule ligne
-- visible, sans caractère invisible.
--
-- Pourquoi maintenant. Le ticket 14 ouvre l'écriture du lexique au connecteur,
-- mais ce n'est pas le connecteur qui pose le problème : la politique
-- `terms_insert_authenticated` autorise déjà n'importe quel compte authentifié
-- à insérer dans `terms`, directement par la Data API, avec la clé publiable.
-- Une validation zod dans la route ne protège donc rien du tout — elle borne un
-- chemin sur deux. Seule la base borne les deux.
--
-- Ce que ça protège. Le finnois d'un terme est recopié tel quel dans ce que
-- Claude lit quand il ajoute un produit, et dans ce que l'utilisateur lit en
-- rayon. Un compte pourrait déposer une traduction contenant du texte mis en
-- forme comme une consigne. La contrainte ne modère pas le sens — personne ne
-- sait le faire en SQL — elle retire ce qui rend le texte crédible comme
-- consigne : la longueur, les sauts de ligne, et tout ce qui se cache.
--
-- Ce que ça ne protège pas, et c'est assumé : une traduction fausse, ou
-- insultante, reste possible. Voir D8 dans docs/CADRAGE.md.

-- ---------------------------------------------------------------------------
-- La classe des caractères interdits
-- ---------------------------------------------------------------------------
--
-- `[[:cntrl:]]` seul ne suffit pas, et c'est contre-intuitif : il attrape bien
-- le saut de ligne, mais **pas** U+2028 (séparateur de ligne), **pas** U+200B
-- (espace de largeur nulle), **pas** U+202E (inversion du sens d'écriture, qui
-- affiche un texte à l'envers de ce qu'il contient). Vérifié sur cette base
-- avant d'écrire la contrainte, pas supposé.
--
-- Les échappements `\uXXXX` sont volontaires : écrire ces caractères en clair
-- donnerait une contrainte dont on ne peut pas relire le contenu, dans un
-- fichier dont toute la valeur est d'être relisible.
--
--    -   séparateurs de ligne et de paragraphe
--   ​-‏  largeur nulle, et marques de direction
--   ‪-‮  incorporation et inversion de direction
--   ⁠-⁤  liants invisibles
--   ⁦-⁩  isolats de direction
--   ﻿         espace insécable de largeur nulle
--
-- Les diacritiques du finnois et du français (ä, ö, è, î) n'en font pas partie
-- et passent sans rien changer : vérifié sur « pähkinä » et « crème fraîche ».

-- ---------------------------------------------------------------------------
-- Les contraintes
-- ---------------------------------------------------------------------------
--
-- `not valid` est délibéré, et ce n'est pas de la prudence de principe. Une
-- contrainte validée balaie la table et **échoue si une seule ligne la viole** —
-- or `terms` est inscriptible par n'importe quel compte authentifié, et
-- l'inscription est ouverte. Quelqu'un pourrait donc déposer une ligne
-- violant la règle avant que cette migration ne tourne : elle échouerait, et
-- comme elle ne serait pas enregistrée comme appliquée, **toutes les migrations
-- suivantes resteraient bloquées derrière elle**, sur une base dont le code est
-- déjà déployé. C'est exactement le décalage schéma/code que CLAUDE.md décrit,
-- déclenché par un tiers.
--
-- `not valid` contraint toutes les écritures futures, qui sont ce qu'on veut
-- contraindre, et ne dit rien du passé. Les 286 entrées existantes respectent
-- déjà la règle — 24 caractères au plus en français, 20 en finnois, aucun
-- caractère de contrôle — donc la validation pourra se faire plus tard par un
-- `validate constraint`, à froid, sans bloquer personne.
--
-- Idempotence sans `drop constraint` : le retrait d'une contrainte est refusé
-- par `npm run migrations:verifier`, à juste titre. Une existence vérifiée
-- suffit.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.terms'::regclass and conname = 'terms_fr_forme'
  ) then
    alter table public.terms
      add constraint terms_fr_forme check (
        fr = btrim(fr)
        and char_length(fr) between 1 and 80
        and fr !~ '[[:cntrl:] - ​-‏‪-‮⁠-⁤⁦-⁩﻿]'
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.terms'::regclass and conname = 'terms_fi_forme'
  ) then
    alter table public.terms
      add constraint terms_fi_forme check (
        fi = btrim(fi)
        and char_length(fi) between 1 and 80
        and fi !~ '[[:cntrl:] - ​-‏‪-‮⁠-⁤⁦-⁩﻿]'
      ) not valid;
  end if;

  -- Plus large que `fr` à dessein : `normalize()` remplace « œ » par « oe » et
  -- « æ » par « ae », donc la forme normalisée peut être **plus longue** que la
  -- saisie. Bornée à 80 comme `fr`, cette contrainte refuserait une entrée que
  -- la validation du connecteur a acceptée — le genre d'écart qui fait échouer
  -- une écriture pour une raison que personne ne comprend.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.terms'::regclass and conname = 'terms_fr_normalized_forme'
  ) then
    alter table public.terms
      add constraint terms_fr_normalized_forme check (
        char_length(fr_normalized) between 1 and 100
      ) not valid;
  end if;
end
$$;

comment on constraint terms_fr_forme on public.terms is
  'Forme, pas contenu : une seule ligne visible, longueur bornée. Voir D8.';

comment on constraint terms_fi_forme on public.terms is
  'Le finnois est recopié dans ce que lit Claude : il reste sur une ligne.';
