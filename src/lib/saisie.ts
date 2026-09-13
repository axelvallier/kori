/**
 * Analyse d'une ligne saisie : séparer la quantité du produit.
 *
 * Personne ne remplit deux champs pour ajouter cinq cents grammes de farine.
 * La quantité se tape dans la même phrase, et c'est ici qu'elle s'en détache.
 *
 * La quantité est du **texte libre**, jamais un nombre et une unité séparés :
 * aucune conversion, aucun calcul, aucune addition de deux lignes. « 500 g » et
 * « 1 paquet » sont le même genre de chose pour cette application — quelque
 * chose à lire devant le rayon. Les convertir demanderait de connaître le
 * conditionnement réel, que personne ne saisira.
 */

/** Unités de mesure, collées ou non au nombre. */
const UNITES = [
  "kg", "g", "mg",
  "l", "dl", "cl", "ml",
  "cs", "cc",
];

/**
 * Contenants et portions. Ils font partie de la quantité, pas du produit :
 * « 1 paquet de pâtes » s'achète au paquet, mais le terme à traduire est
 * « pâtes ». Au pluriel aussi, « 2 paquets de pâtes ».
 */
const CONTENANTS = [
  "paquet", "boîte", "boite", "bouteille", "brique", "pot", "sachet", "barquette",
  "botte", "gousse", "tranche", "pack", "filet", "bocal", "canette", "part",
];

const NOMBRE = "\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?";
const MOTS = [...UNITES, ...CONTENANTS, ...CONTENANTS.map((c) => `${c}s`)]
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * `^ nombre ( unité|contenant )? ( de | d' | espace ) produit`
 *
 * Un seul motif pour les quatre formes du ticket : « 2 tomates »,
 * « 500 g de farine », « 500g de farine », « 1 paquet de pâtes ».
 *
 * Deux détails qui ont coûté un test rouge chacun :
 *
 * Le séparateur est **obligatoire**. Sans lui, « 500 » se lisait « 50 » suivi
 * du produit « 0 » : le groupe du nombre reculait d'un caractère pour laisser
 * de quoi remplir le `(.+)` final, qui exige au moins un caractère.
 *
 * Le partitif est essayé **avant** l'espace seule. Dans l'autre ordre,
 * « 1 paquet de pâtes » donnait le produit « de pâtes », l'espace après
 * « paquet » ayant suffi à satisfaire l'alternative.
 */
const MOTIF = new RegExp(
  `^(${NOMBRE})\\s*(${MOTS})?(?:\\s*(?:de\\s+|d['’]\\s*)|\\s+)(.+)$`,
  "i",
);

/** Un reste qui n'est qu'une unité ou un contenant n'est pas un produit. */
const SEUL_MOT = new RegExp(`^(?:${MOTS})$`, "i");

export type Saisie = {
  /** Texte libre, chaîne vide s'il n'y a pas de quantité — jamais `null`. */
  quantite: string;
  /** Ce qui part au lexique. */
  produit: string;
};

export function parseEntry(texte: string): Saisie {
  const propre = texte.trim().replace(/\s+/g, " ");
  const trouve = MOTIF.exec(propre);

  if (!trouve) return { quantite: "", produit: propre };

  const [, nombre, mot, reste] = trouve;
  const produit = reste.trim();

  // « 500 » seul, ou « 2 kg » où il ne reste qu'une unité : il n'y a rien à
  // traduire, donc rien à séparer. La ligne entière redevient le produit,
  // quitte à ce qu'elle n'ait pas de traduction — mieux vaut un item bizarre,
  // que l'utilisateur relit et corrige, qu'un item vide ou qu'une demande de
  // traduction pour « kg ».
  if (produit === "" || SEUL_MOT.test(produit)) {
    return { quantite: "", produit: propre };
  }

  // L'unité est mise en minuscules — « 500 G » et « 500 g » sont la même
  // chose — mais le produit garde la casse de la saisie : c'est lui que
  // l'utilisateur relit.
  const quantite = mot ? `${nombre} ${mot.toLowerCase()}` : nombre;

  return { quantite, produit };
}
