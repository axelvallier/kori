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
   -- réécriture violerait l'unicité et ferait échouer la migration sur un
   -- `duplicate key` illisible. La ligne à ligature est donc laissée telle
   -- quelle — et le bloc suivant refuse alors de terminer en silence.
   and not exists (
     select 1 from public.terms jumeau
      where jumeau.fr_normalized = replace(replace(terms.fr_normalized, 'œ', 'oe'), 'æ', 'ae')
   );

-- ---------------------------------------------------------------------------
-- Aucune ligne ne doit rester derrière
-- ---------------------------------------------------------------------------

-- Une ligne sautée par la garde ci-dessus n'est pas un détail cosmétique.
-- N'importe quel utilisateur authentifié peut écrire dans `terms` : la
-- politique d'insertion vérifie `created_by = auth.uid()` et rien d'autre, en
-- particulier pas que `fr_normalized` soit bien `normalize(fr)` — c'est le trou
-- que le ticket 18 doit fermer. Quelqu'un peut donc déposer un « boeuf » de son
-- choix avant que cette migration ne tourne. La garde le prendrait alors pour
-- un jumeau légitime, laisserait la vraie ligne sur « bœuf », et cette ligne
-- deviendrait définitivement injoignable : plus rien ne produit cette forme, et
-- `terms` n'a ni update ni delete pour la réparer.
--
-- La migration échoue donc bruyamment plutôt que de céder une entrée du lexique
-- partagé sans que personne ne le voie. Le message nomme les lignes, et la
-- décision revient à un humain.
do $$
declare restantes text;
begin
  select string_agg(format('%s (%s)', fr, fr_normalized), ', ' order by fr)
    into restantes
    from public.terms
   where fr_normalized like '%œ%' or fr_normalized like '%æ%';

  if restantes is not null then
    raise exception
      'Renormalisation incomplète : % . Une forme sans ligature existe déjà pour '
      'ces termes. Vérifier qui l''a créée (colonne created_by) avant de trancher.',
      restantes;
  end if;
end $$;
