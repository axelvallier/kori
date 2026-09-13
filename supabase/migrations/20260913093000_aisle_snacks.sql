-- Ajoute le rayon des confiseries et du grignotage.
--
-- K-ruoka en fait une catégorie de tête, « Makeiset ja naposteltavat », et
-- c'est un rayon physique distinct : chocolat, bonbons, réglisse, chips et
-- fruits secs. Sans lui, ces produits atterrissaient dans `pantry` et
-- envoyaient vers l'allée des farines.
--
-- Positionné avant `drinks` pour suivre l'ordre du magasin, l'énuméré se
-- triant dans son ordre de déclaration.
alter type public.aisle add value 'snacks' before 'drinks';
