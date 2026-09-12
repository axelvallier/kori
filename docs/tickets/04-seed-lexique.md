---
title: "Constituer et importer le lexique initial"
milestone: "M0 Socle"
labels: "type:feat, size:M, area:db"
---
## Contexte

Sans lexique de départ, chaque ajout affiche "traduction manquante" et
l'application ne démontre rien. Deux cents à trois cents termes couvrent
l'essentiel d'un caddie ordinaire.

## À faire

* Fichier `data/terms.csv` versionné, colonnes `fr`, `fi`, `aisle`
* Couvrir les basiques : fruits et légumes courants, viandes et poissons, produits laitiers, farines et sucres, pâtes et riz, conserves, boissons, produits d'entretien et d'hygiène
* Vérifier les termes contre les noms de produits réels de S-kaupat ou K-ruoka, pas contre un traducteur automatique
* Script `npm run seed:terms` idempotent : insertion avec `on conflict (fr_normalized) do nothing`

## Critères d'acceptation

* le script s'exécute deux fois de suite et la seconde n'insère aucune ligne
* dix termes tirés au hasard correspondent à un produit trouvable sur S-kaupat
* les rayons sont renseignés pour tous les termes
