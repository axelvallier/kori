-- Borne la **forme** des entrées du lexique : longueur, et une seule ligne.
--
-- Pourquoi maintenant. Le ticket 14 ouvre l'écriture du lexique au connecteur,
-- mais ce n'est pas le connecteur qui pose le problème : la politique
-- `terms_insert_authenticated` autorise déjà n'importe quel compte authentifié
-- à insérer dans `terms`, directement par la Data API, avec la clé publiable.
-- Une validation zod dans la route ne protège donc rien du tout — elle borne un
-- chemin sur deux. Seule la base peut borner les deux.
--
-- Ce que ça protège. Le finnois d'un terme est recopié tel quel dans ce que
-- Claude lit quand il ajoute un produit. Un compte pourrait déposer une
-- traduction contenant du texte mis en forme comme une consigne, en espérant
-- qu'un autre compte demande ce produit-là. La contrainte ne modère pas le sens
-- — personne ne sait le faire en SQL — elle retire ce qui rend le texte
-- crédible comme consigne : la longueur et les sauts de ligne. Une chaîne d'une
-- seule ligne de 80 caractères reste un mauvais vecteur.
--
-- Ce que ça ne protège pas, et c'est assumé (voir D8 dans docs/CADRAGE.md) :
-- une traduction fausse, ou insultante, reste possible. Le lexique est partagé
-- par décision D2, et sa modération est un problème de contenu, pas de schéma.
--
-- Marge : le plus long terme du lexique actuel fait 24 caractères en français
-- et 20 en finnois, sur 286 entrées. Aucune n'a de caractère de contrôle. La
-- contrainte est donc vérifiée par les données existantes, et 80 laisse de la
-- place aux expressions longues (« viande hachée de bœuf » en fait 21).

alter table public.terms
  add constraint terms_fr_forme
    check (char_length(fr) between 1 and 80 and fr !~ '[[:cntrl:]]'),
  add constraint terms_fi_forme
    check (char_length(fi) between 1 and 80 and fi !~ '[[:cntrl:]]'),
  add constraint terms_fr_normalized_forme
    check (char_length(fr_normalized) between 1 and 80);

comment on constraint terms_fr_forme on public.terms is
  'Forme, pas contenu : une seule ligne, longueur bornée. Voir D8.';

comment on constraint terms_fi_forme on public.terms is
  'Le finnois est recopié dans ce que lit Claude : il reste sur une ligne.';
