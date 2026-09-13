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
 *
 * Les accents, eux, sont **conservés** : « crème fraîche » et « creme fraiche »
 * restent deux formes distinctes, et la seconde ne trouve rien. C'est une
 * question ouverte, pas un choix — elle appartient au ticket 18, qui doit la
 * trancher en même temps que la règle SQL équivalente. Le coût est le même que
 * celui payé ici pour les ligatures : une migration qui réécrit
 * `fr_normalized` sur les lignes concernées, `terms` n'ayant pas d'update.
 */
export function normalize(fr: string): string {
  let s = fr
    .toLowerCase()
    // Les claviers de téléphone produisent l'apostrophe typographique par
    // défaut en français. Sans cette ligne, « d’ail » et « d'ail » seraient
    // deux termes distincts, et celui saisi au magasin ne trouverait rien.
    .replace(/[\u2019\u02BC]/g, "'")
    // Les ligatures, pour la même raison, en plus courant encore : le lexique
    // écrit « bœuf » et « œuf », personne ne les tape comme ça sur un clavier
    // de téléphone. Sans cette ligne, « boeuf » et « oeufs » — deux des mots
    // les plus probables d'une liste de courses — ne trouvent rien.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
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
 * Retrouve la ligne du lexique correspondant à un texte saisi en français.
 *
 * Correspondance **exacte** sur la forme normalisée, et rien d'autre : pas
 * d'appel réseau vers un traducteur, pas de modèle de langue, pas de
 * correspondance approximative (décision D2). Une correspondance approximative
 * qui se trompe est pire que pas de traduction du tout — devant le rayon,
 * personne ne vérifie.
 *
 * Le client est passé en argument plutôt qu'importé : ce module est aussi
 * importé par le seed, qui utilise la clé secrète, et le sera par le connecteur.
 * Chacun apporte le sien, et ce fichier n'a pas à savoir lequel.
 */
export async function resolveTerm(
  supabase: SupabaseClient,
  fr: string,
): Promise<Terme | null> {
  const forme = normalize(fr);
  if (forme === "") return null;

  const { data, error } = await supabase
    .from("terms")
    .select("id, fr, fi, aisle")
    .eq("fr_normalized", forme)
    .maybeSingle<Terme>();

  if (error) {
    // Volontairement pas de `throw`. Un terme non résolu donne un item sans
    // `term_id`, c'est-à-dire l'état « traduction manquante » que le modèle
    // prévoit déjà (CADRAGE.md) : l'item existe, il est visible, et l'écran de
    // lexique comme le connecteur savent le rattraper. Lever ici ferait perdre
    // l'ajout lui-même, ce qui est pire — l'utilisateur est debout dans un
    // magasin, il ne retapera pas.
    console.error("resolveTerm", forme, error.code, error.message);
    return null;
  }

  return data;
}
