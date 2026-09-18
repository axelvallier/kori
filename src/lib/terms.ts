/**
 * Normalisation et résolution du lexique.
 *
 * Seule implémentation du projet. Le seed, l'écran de lexique et le connecteur
 * MCP importent tous ces fonctions. Deux règles qui divergeraient d'un
 * caractère rempliraient le lexique de doublons invisibles : « tomate » et
 * « Tomates » deviendraient deux entrées, et l'utilisateur verrait une
 * traduction manquante sur un terme déjà traduit.
 *
 * Voir .claude/rules/lexique.md et les cas de test dans terms.test.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Articles et partitifs retirés en tête. L'ordre compte : les formes les plus
 * longues d'abord, sinon « de la » serait mangé par « de ».
 */
const PREFIXES = [
  "de la ",
  "de l'",
  "des ",
  "du ",
  "les ",
  "le ",
  "la ",
  "une ",
  "un ",
  "d'",
  "l'",
];

/**
 * Mots qui finissent par s ou x au singulier, ou qui sont invariables. Sans
 * cette liste, « ananas » devient « anana », « noix » devient « noi », et
 * « petits pois » devient « petit poi » — trois termes introuvables.
 *
 * Écrits **sans accent**, parce que la comparaison se fait après leur retrait :
 * « maïs » arrive ici sous la forme « mais ».
 */
const INVARIABLES = new Set([
  "ananas",
  "anis",
  "cassis",
  "chips",
  "couscous",
  "jus",
  "mais",
  "noix",
  "os",
  "pois",
  "radis",
  "tapas",
]);

/**
 * Les lettres accentuées du français, et ce qu'elles deviennent. Une table
 * explicite plutôt qu'une décomposition Unicode (`normalize("NFD")`) : la
 * fonction SQL `normalize_fr` fait la même chose avec `translate()`, et deux
 * tables identiques se comparent à l'œil, alors qu'une décomposition Unicode
 * et un dictionnaire `unaccent` ne se comparent pas.
 */
const ACCENTUEES = "àâäéèêëîïôöùûüç";
const SANS_ACCENT = "aaaeeeeiioouuuc";

/**
 * Ce qui compte comme espace. La classe est écrite en toutes lettres plutôt
 * que `\s`, parce que `\s` n'a pas le même contenu en JavaScript et dans les
 * expressions régulières de Postgres — l'espace insécable, par exemple, est
 * dans l'un et pas dans l'autre. `normalize_fr` porte la même liste.
 */
const ESPACES = /[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;

/** Retire un pluriel simple sur un mot, sauf s'il est invariable. */
function singulier(mot: string): string {
  if (INVARIABLES.has(mot)) return mot;
  // En points de code, comme `char_length()` côté SQL — pas en unités UTF-16.
  if ([...mot].length <= 3) return mot;
  return mot.replace(/[sx]$/, "");
}

/**
 * Forme canonique d'un terme français, utilisée comme clé d'unicité du lexique.
 *
 * **Cette fonction a un jumeau SQL**, `public.normalize_fr`, qui calcule la
 * colonne générée `terms.fr_normalized`. Les deux doivent rester
 * équivalentes, étape par étape et dans le même ordre : toute divergence est
 * un bug, même si les tests TypeScript passent. `npm run db:test:normalisation`
 * les compare sur tous les cas de `terms.cas.ts` et sur tout le lexique.
 *
 * Le pluriel est retiré sur **chaque** mot, pas seulement le dernier : en
 * français il se marque partout, et « tomates cerises » doit rejoindre
 * « tomate cerise ».
 *
 * Les accents sont **retirés** (décision D9) : « crème fraîche » et « creme
 * fraiche » donnent la même forme. Le lexique les écrit, personne ne les tape
 * sur un clavier de téléphone réglé en finnois. Conséquence assumée : deux
 * mots qui ne diffèrent que par l'accent partagent une entrée — « pâtes » et
 * « pâté » donnent tous deux « pate ».
 */
export function normalize(fr: string): string {
  let s = fr
    .toLowerCase()
    // Les claviers de téléphone produisent l'apostrophe typographique par
    // défaut en français. Sans cette ligne, « d’ail » et « d'ail » seraient
    // deux termes distincts, et celui saisi au magasin ne trouverait rien.
    .replace(/[\u2019\u02bc]/g, "'")
    // Les ligatures, pour la même raison, en plus courant encore : le lexique
    // écrit « bœuf » et « œuf », personne ne les tape comme ça sur un clavier
    // de téléphone. Sans cette ligne, « boeuf » et « oeufs » — deux des mots
    // les plus probables d'une liste de courses — ne trouvent rien.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[àâäéèêëîïôöùûüç]/g, (c) => SANS_ACCENT[ACCENTUEES.indexOf(c)])
    .replace(ESPACES, " ")
    .trim();

  for (const prefixe of PREFIXES) {
    if (s.startsWith(prefixe)) {
      s = s.slice(prefixe.length).trim();
      break;
    }
  }

  return s.split(" ").map(singulier).join(" ").trim();
}

/* -------------------------------------------------------------------------- */
/* Résolution                                                                 */
/* -------------------------------------------------------------------------- */

/** Ce qu'une ligne de liste a besoin de savoir d'un terme du lexique. */
export type Terme = {
  id: string;
  fr: string;
  fi: string;
  aisle: string;
};

/**
 * Retrouve les lignes du lexique correspondant à un lot de textes français.
 *
 * Correspondance **exacte** sur la forme normalisée, et rien d'autre : pas
 * d'appel réseau vers un traducteur, pas de modèle de langue, pas de
 * correspondance approximative (décision D2). Une correspondance approximative
 * qui se trompe est pire que pas de traduction du tout — devant le rayon,
 * personne ne vérifie.
 *
 * Le lot existe pour le connecteur : une recette arrive d'un coup, et résoudre
 * huit ingrédients en huit allers-retours ferait huit fois le trajet réseau
 * pour la même réponse. `resolveTerm` passe par ici, de sorte qu'il n'y ait
 * toujours qu'un seul chemin de résolution — voir .claude/rules/lexique.md.
 *
 * La clé du dictionnaire rendu est la **forme normalisée**, pas la saisie :
 * deux saisies qui convergent (« Tomates » et « des tomates ») partagent une
 * entrée, et l'appelant retrouve la sienne en normalisant à son tour.
 *
 * Le client est passé en argument plutôt qu'importé : ce module est aussi
 * importé par le seed, qui utilise la clé secrète, et par le connecteur, qui
 * utilise la sienne. Chacun apporte le sien, et ce fichier n'a pas à savoir
 * lequel.
 */
export async function resolveTermes(
  supabase: SupabaseClient,
  frs: string[],
): Promise<Map<string, Terme>> {
  const formes = [...new Set(frs.map(normalize).filter((forme) => forme !== ""))];
  const trouves = new Map<string, Terme>();

  // Une saisie vide ne part pas en requête : `in` sur une liste vide est une
  // requête qui ne peut rien rendre.
  if (formes.length === 0) return trouves;

  const { data, error } = await supabase
    .from("terms")
    .select("id, fr, fi, aisle, fr_normalized")
    .in("fr_normalized", formes)
    .returns<(Terme & { fr_normalized: string })[]>();

  if (error) {
    // Volontairement pas de `throw`. Un terme non résolu donne un item sans
    // `term_id`, c'est-à-dire l'état « traduction manquante » que le modèle
    // prévoit déjà (CADRAGE.md) : l'item existe, il est visible, et l'écran de
    // lexique comme le connecteur savent le rattraper. Lever ici ferait perdre
    // l'ajout lui-même, ce qui est pire — l'utilisateur est debout dans un
    // magasin, il ne retapera pas.
    console.error("resolveTermes", formes.length, error.code, error.message);
    return trouves;
  }

  for (const ligne of data ?? []) {
    const { fr_normalized, ...terme } = ligne;
    trouves.set(fr_normalized, terme);
  }

  return trouves;
}

/**
 * Le cas d'un seul terme, celui de la saisie à l'écran. Délègue au lot pour
 * qu'il n'y ait qu'une règle de résolution à relire, et une seule à corriger.
 */
export async function resolveTerm(
  supabase: SupabaseClient,
  fr: string,
): Promise<Terme | null> {
  const forme = normalize(fr);
  if (forme === "") return null;

  return (await resolveTermes(supabase, [fr])).get(forme) ?? null;
}
