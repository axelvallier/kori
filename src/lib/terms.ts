/**
 * Normalisation du lexique.
 *
 * Seule implémentation du projet. Le seed, l'écran de lexique et le connecteur
 * MCP importent tous cette fonction. Deux règles qui divergeraient d'un
 * caractère rempliraient le lexique de doublons invisibles : « tomate » et
 * « Tomates » deviendraient deux entrées, et l'utilisateur verrait une
 * traduction manquante sur un terme déjà traduit.
 *
 * Voir .claude/rules/lexique.md. `resolveTerm()` et la batterie de tests
 * arrivent au ticket 07.
 */

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
 */
const INVARIABLES = new Set([
  "ananas",
  "anis",
  "cassis",
  "chips",
  "couscous",
  "jus",
  "maïs",
  "noix",
  "os",
  "pois",
  "radis",
  "tapas",
]);

/** Retire un pluriel simple sur un mot, sauf s'il est invariable. */
function singulier(mot: string): string {
  if (INVARIABLES.has(mot)) return mot;
  if (mot.length <= 3) return mot;
  return mot.replace(/[sx]$/, "");
}

/**
 * Forme canonique d'un terme français, utilisée comme clé d'unicité du lexique.
 *
 * Le pluriel est retiré sur **chaque** mot, pas seulement le dernier : en
 * français il se marque partout, et « tomates cerises » doit rejoindre
 * « tomate cerise ».
 */
export function normalize(fr: string): string {
  let s = fr
    .toLowerCase()
    // Les claviers de téléphone produisent l'apostrophe typographique par
    // défaut en français. Sans cette ligne, « d’ail » et « d'ail » seraient
    // deux termes distincts, et celui saisi au magasin ne trouverait rien.
    .replace(/[\u2019\u02BC]/g, "'")
    .trim()
    .replace(/\s+/g, " ");

  for (const prefixe of PREFIXES) {
    if (s.startsWith(prefixe)) {
      s = s.slice(prefixe.length).trim();
      break;
    }
  }

  return s.split(" ").map(singulier).join(" ").trim();
}
