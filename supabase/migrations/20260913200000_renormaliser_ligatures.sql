-- Renormalise les termes écrits avec une ligature.
--
-- `normalize()` remplace désormais « œ » par « oe » et « æ » par « ae »
-- (ticket 07). Sans cette migration, le lexique garderait les formes écrites
-- avant ce changement, et les deux règles divergeraient : le lexique contient
-- « bœuf » et « œuf », personne ne les tape comme ça sur un clavier de
-- téléphone, et « boeuf » ne trouverait rien.
--
-- C'est le coût annoncé dans REX-M0 : `terms` n'ayant aucune politique
-- d'update, toute évolution de la règle de normalisation demande une migration
-- pour réécrire `fr_normalized`. Elle tourne en tant que propriétaire de la
-- base, donc hors RLS.

update public.terms
   set fr_normalized = replace(replace(fr_normalized, 'œ', 'oe'), 'æ', 'ae')
 where (fr_normalized like '%œ%' or fr_normalized like '%æ%')
   -- Garde contre la collision : si la forme sans ligature existe déjà, la
   -- réécriture violerait l'unicité et ferait échouer la migration sur la base
   -- hébergée. La ligne à ligature est alors laissée telle quelle. Elle devient
   -- inatteignable, ce qui est sans conséquence — plus rien ne produit cette
   -- forme — et sa suppression demanderait une décision explicite, `terms`
   -- n'ayant volontairement ni update ni delete côté application.
   and not exists (
     select 1 from public.terms jumeau
      where jumeau.fr_normalized = replace(replace(terms.fr_normalized, 'œ', 'oe'), 'æ', 'ae')
   );
