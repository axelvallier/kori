/**
 * Les cas de normalisation, partagés entre deux vérifications :
 *
 *   - `terms.test.ts`, qui les passe à `normalize()` en TypeScript (`npm test`) ;
 *   - `scripts/verifier-normalisation.mts`, qui les passe à `normalize_fr()`
 *     dans Postgres et compare les deux réponses (`npm run db:test:normalisation`).
 *
 * Un cas ajouté ici est donc vérifié des deux côtés. C'est le point du
 * ticket 18 : les deux implémentations ne peuvent diverger que si personne ne
 * les compare, et elles ne se comparent que sur les mêmes entrées.
 *
 * Les cas marqués « piège » sont ceux où le retrait naïf du pluriel, ou la
 * comparaison naïve de deux chaînes, donne un faux résultat.
 */

/** Saisie, forme attendue, ce que le cas démontre. */
export const CAS: readonly (readonly [string, string, string])[] = [
  ["tomate", "tomate", "une saisie déjà canonique ne bouge pas"],
  ["Tomate", "tomate", "la casse"],
  ["TOMATES", "tomate", "la casse et le pluriel ensemble"],
  ["  tomate  ", "tomate", "les espaces de bord"],
  ["Des Tomates ", "tomate", "partitif, casse, pluriel et espace, tout à la fois"],
  ["tomates", "tomate", "le pluriel simple"],
  ["tomates    cerises", "tomate cerise", "les espaces multiples, et le pluriel sur chaque mot"],
  ["tomates\u00a0cerises", "tomate cerise", "l'espace insécable, que le clavier de téléphone glisse parfois"],
  ["tomates\tcerises\n", "tomate cerise", "tabulation et saut de ligne, collés depuis une recette"],
  ["les pommes", "pomme", "l'article défini pluriel"],
  ["  des   pommes  de terre ", "pomme de terre", "partitif, espaces multiples et locution"],
  ["le pain", "pain", "l'article défini masculin"],
  ["la farine", "farine", "l'article défini féminin"],
  ["un citron", "citron", "l'article indéfini masculin"],
  ["une pomme", "pomme", "l'article indéfini féminin"],
  ["du beurre", "beurre", "le partitif masculin"],
  ["de la crème", "creme", "le partitif féminin, forme longue d'abord"],
  ["de l'huile", "huile", "le partitif devant voyelle"],
  ["d'ail", "ail", "l'élision"],
  ["d\u2019ail", "ail", "l'apostrophe typographique du clavier de téléphone"],
  ["l'oignon", "oignon", "l'article élidé"],
  ["bœuf", "boeuf", "piège : la ligature du lexique"],
  ["boeuf", "boeuf", "piège : et la forme tapée au clavier, qui doit lui répondre"],
  ["œufs", "oeuf", "piège : ligature et pluriel, le mot le plus probable d'une liste"],
  ["oeufs", "oeuf", "piège : sa forme tapée au clavier"],
  ["Œufs", "oeuf", "piège : la ligature en capitale"],
  ["ananas", "ananas", "piège : singulier en s, le pluriel naïf donnerait « anana »"],
  ["des ananas", "ananas", "piège : le même, précédé d'un partitif"],
  ["riz", "riz", "piège : mot court, aucun retrait ne doit s'appliquer"],
  ["noix", "noix", "piège : singulier en x, le pluriel naïf donnerait « noi »"],
  ["petits pois", "petit pois", "piège : invariable en second mot, pluriel sur le premier"],
  ["jus", "jus", "piège : invariable"],
  ["chips", "chips", "piège : invariable, et toujours écrit au pluriel"],
  ["maïs", "mais", "piège : invariable écrit avec un tréma — la liste des invariables est sans accent"],
  ["pain", "pain", "un mot en n, aucun retrait"],
  ["lait", "lait", "un mot en t, aucun retrait"],
  ["", "", "la chaîne vide ne lève pas"],
  ["   ", "", "une saisie d'espaces se réduit à la chaîne vide"],
  ["de la", "de la", "un partitif seul reste tel quel : il n'est un préfixe que s'il y a un mot derrière"],
  ["crème fraîche", "creme fraiche", "les accents sont retirés (décision D9)"],
  ["creme fraiche", "creme fraiche", "et la forme tapée sans accent lui répond"],
  ["Crème Fraîche", "creme fraiche", "casse et accents ensemble"],
  ["glaçons", "glacon", "la cédille, et le pluriel"],
  ["pêches", "peche", "l'accent circonflexe"],
  ["pâtes", "pate", "conséquence assumée de D9 : « pâtes » et « pâté » partagent une forme"],
  ["pâté", "pate", "conséquence assumée de D9 : la même forme que « pâtes »"],
  ["viande hachée de bœuf", "viande hachee de boeuf", "une expression entière"],
];
