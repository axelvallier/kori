import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { RAYONS } from "./rayons.ts";
import { normalize } from "./terms.ts";

/**
 * Enrichir le lexique : ce que l'écran `/lexicon` et le connecteur MCP font
 * en commun (ticket 16). Une seule implémentation, pour que « Claude a ajouté
 * une traduction » et « je l'ai tapée en rayon » produisent exactement le même
 * résultat — même insertion, même relecture après conflit, même rattachement
 * des lignes qui attendaient.
 *
 * Le lexique est **global** (D2) : une traduction ajoutée par un compte
 * profite à tous les suivants, et le rattachement rétroactif touche aussi les
 * lignes des autres comptes. C'est la seule écriture du projet qui sorte du
 * compte appelant, et c'est voulu — voir D8 pour ce que ça borne, et ce que ça
 * ne borne pas.
 */

/** Les codes de rayon, dans l'ordre de l'écran, pour un schéma zod. */
export const CODES_RAYONS = RAYONS.map((r) => r.code) as [
  (typeof RAYONS)[number]["code"],
  ...(typeof RAYONS)[number]["code"][],
];

/**
 * Une chaîne destinée au lexique : une seule ligne, longueur bornée.
 *
 * La base porte la même règle en contrainte (migration
 * `20260914180000_borner_la_forme_du_lexique`), et c'est elle qui protège
 * vraiment — n'importe quel compte peut écrire dans `terms` par la Data API,
 * sans passer par ici. Ce schéma existe pour répondre une phrase lisible au
 * lieu de laisser remonter une violation de contrainte.
 */
export const texteDeLexique = (quoi: string) =>
  z
    .string()
    .trim()
    .min(1, `${quoi} ne peut pas être vide`)
    .max(80, `${quoi} : 80 caractères au maximum`)
    .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), `${quoi} doit tenir sur une seule ligne`);

/** Un terme en attente de traduction, et le nombre de lignes qui l'attendent. */
export type Manquant = { fr: string; forme: string; lignes: number };

/**
 * Regroupe les lignes sans traduction par forme normalisée : « oeufs » et
 * « des œufs » sont un seul terme à traduire, pas deux. Proposer deux fois le
 * même travail produirait la seconde insertion en conflit. Le français
 * conservé est celui de la première ligne rencontrée, dans l'ordre reçu.
 */
export function regrouperManquants(lignes: readonly { raw_fr: string }[]): Manquant[] {
  const parForme = new Map<string, Manquant>();
  for (const { raw_fr } of lignes) {
    const forme = normalize(raw_fr);
    if (forme === "") continue;
    const vu = parForme.get(forme);
    if (vu) vu.lignes += 1;
    else parForme.set(forme, { fr: raw_fr, forme, lignes: 1 });
  }
  return [...parForme.values()];
}

/* -------------------------------------------------------------------------- */
/* Insertion                                                                  */
/* -------------------------------------------------------------------------- */

export type TermeInsere = { id: string; fr: string; fi: string; aisle: string };

export type ResultatAjout =
  | {
      ok: true;
      /** Faux quand le terme existait déjà : rien n'a été écrasé. */
      cree: boolean;
      terme: TermeInsere;
      /** Lignes de la liste de l'appelant qui affichent désormais le finnois. */
      rattachees: number;
      /** Faux si le rattachement de ces lignes a échoué : le terme est dans le
       *  lexique, mais la ligne est toujours en français. */
      rattachementOk: boolean;
    }
  | { ok: false; message: string };

/**
 * Ajoute un terme au lexique, puis rattache les lignes qui l'attendaient.
 *
 * Le client reçu est celui de la **clé secrète** : le rattachement doit
 * atteindre les lignes des autres comptes, ce qu'aucune politique RLS ne
 * permet. En contrepartie, tout ce qui touche au compte appelant est filtré
 * ici, à la main — `created_by`, et `list_id` pour la passe « propre ».
 *
 * L'insertion est écrite pour **tolérer** le conflit, pas pour l'éviter : un
 * select suivi d'un insert laisse une fenêtre entre les deux, et deux appels
 * simultanés sur le même terme la trouveraient. C'est la contrainte d'unicité
 * sur `fr_normalized` qui tranche, jamais nous. Voir .claude/rules/lexique.md.
 *
 * `fr_normalized` n'est pas envoyée : la base la calcule elle-même, colonne
 * générée par `normalize_fr()` (ticket 18). La forme calculée ici sert à relire
 * la ligne en cas de conflit et à rattacher, et doit valoir la même chose.
 */
export async function ajouterAuLexique(
  supabase: SupabaseClient,
  entree: { fr: string; fi: string; aisle: string; userId: string; listId: string | null },
): Promise<ResultatAjout> {
  const forme = normalize(entree.fr);
  if (forme === "") {
    return { ok: false, message: "Le terme français ne donne aucune forme à indexer." };
  }

  const { data: cree, error } = await supabase
    .from("terms")
    .insert({ fr: entree.fr, fi: entree.fi, aisle: entree.aisle, created_by: entree.userId })
    .select("id, fr, fi, aisle")
    .maybeSingle<TermeInsere>();

  let terme = cree;
  let nouveau = true;

  if (error) {
    // 23505 : violation d'unicité. Le terme existait déjà, ou vient d'être
    // écrit par un appel concurrent — les deux se traitent pareil.
    if (error.code !== "23505") {
      console.error("ajouterAuLexique", error.code, error.message);
      return { ok: false, message: "L'écriture dans le lexique n'est pas passée." };
    }

    const { data: existant } = await supabase
      .from("terms")
      .select("id, fr, fi, aisle")
      .eq("fr_normalized", forme)
      .maybeSingle<TermeInsere>();

    if (!existant) {
      // Conflit sans ligne à relire : impossible en pratique, `terms` n'a ni
      // suppression ni mise à jour. Le dire plutôt que de renvoyer un succès
      // qui n'a rien écrit.
      return { ok: false, message: "Le lexique a refusé l'écriture sans qu'on sache pourquoi." };
    }

    terme = existant;
    nouveau = false;
  }

  if (!terme) return { ok: false, message: "L'écriture dans le lexique n'est pas passée." };

  const { propres, ok } = await rattacher(supabase, entree.listId, forme, terme.id);

  return { ok: true, cree: nouveau, terme, rattachees: propres, rattachementOk: ok };
}

/* -------------------------------------------------------------------------- */
/* Rattachement rétroactif                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Plafond du balayage rétroactif chez **les autres comptes**. Le rattachement
 * compare `normalize(raw_fr)` en TypeScript, donc il faut ramener les lignes
 * pour les comparer. On borne — mais on ne borne que ce qui est de toute façon
 * « au mieux ».
 *
 * **Ce n'est pas ce nombre qui tranche.** PostgREST applique son propre plafond,
 * `max_rows = 1000` dans `supabase/config.toml`, et il gagne toujours : demander
 * 2000 lignes en rend 1000, sans erreur et sans rien dire. Une troncature ne se
 * détecte donc pas en comparant le nombre de lignes reçues à cette constante —
 * c'est le comptage exact qui le dit, et lui seul.
 */
const PLAFOND_AUTRES = 1000;

/**
 * Taille des lots d'écriture. PostgREST passe `id=in.(…)` dans la chaîne de
 * requête : quelques centaines d'identifiants suffisent à dépasser la longueur
 * d'URL admise, et l'écriture échoue en bloc. Cent est la même borne que les
 * outils à identifiants du connecteur.
 */
const TAILLE_LOT = 100;

/**
 * Ce que le rattachement a fait, du point de vue de l'appelant.
 *
 * `ok` existe parce que « zéro ligne rattachée » et « le rattachement a
 * échoué » ne doivent pas se raconter pareil : dans le second cas, la ligne de
 * l'utilisateur est toujours en français, le terme est désormais dans le
 * lexique, et personne ne relancera l'opération. Un échec silencieux ici est un
 * bug qu'on ne découvre qu'en rayon.
 */
type Rattachement = { propres: number; ok: boolean };

/**
 * Rattache rétroactivement les lignes qui attendaient ce terme, **tous comptes
 * confondus** : c'est la moitié utile de la décision D2, une traduction ajoutée
 * par quelqu'un doit réparer les listes de tout le monde.
 *
 * **En deux passes, et l'ordre n'est pas cosmétique.** La liste de l'appelant
 * est traitée d'abord, seule, sans plafond partagé : c'est la seule dont le
 * résultat lui est rendu, et c'est celle qu'il va regarder dans la seconde qui
 * suit. Une passe unique plafonnée mettrait sa ligne en concurrence avec toutes
 * les lignes non traduites de tous les comptes — et n'importe qui pourrait, en
 * remplissant sa propre liste, faire tomber celle des autres hors de la fenêtre
 * et désactiver l'auto-réparation pour tout le monde. La passe sur les autres
 * comptes reste « au mieux », plafonnée, et ses échecs ne regardent que les
 * journaux.
 *
 * **Le nombre rendu ne compte que les lignes du compte appelant.** Le total
 * part dans les journaux du serveur : dire à l'appelant « 3 lignes rattachées
 * ailleurs » lui apprendrait que d'autres comptes ont ce produit dans leur
 * liste, ce qui ne le regarde pas.
 */
async function rattacher(
  supabase: SupabaseClient,
  listId: string | null,
  forme: string,
  termeId: string,
): Promise<Rattachement> {
  const propres = await rattacherLot(supabase, listId, termeId, forme, true);

  // Les autres comptes, au mieux. Une erreur ici n'est pas remontée à
  // l'appelant : ce n'est pas sa liste, et il ne peut rien y faire.
  const autres = await rattacherLot(supabase, listId, termeId, forme, false);

  if (autres.touchees > 0) {
    console.info(`rattacher : ${autres.touchees} ligne(s) rattachée(s) chez d'autres comptes`);
  }

  return { propres: propres.touchees, ok: propres.ok };
}

/**
 * Une passe de rattachement, sur la liste de l'appelant (`propre`) ou sur
 * toutes les autres. Rendue séparée pour que les deux passes ne puissent pas
 * diverger : même lecture, même comparaison, même écriture par lots.
 */
async function rattacherLot(
  supabase: SupabaseClient,
  listId: string | null,
  termeId: string,
  forme: string,
  propre: boolean,
): Promise<{ touchees: number; ok: boolean }> {
  // Sans liste rattachée au compte — l'anomalie de provisionnement — il n'y a
  // pas de « chez soi » à traiter, et « les autres » sont tout le monde.
  if (propre && listId === null) return { touchees: 0, ok: true };

  // `count: "exact"` : le nombre total de lignes qui correspondent, à comparer
  // au nombre de lignes reçues. C'est la seule façon de voir une troncature,
  // le plafond réel étant celui du serveur et non celui qu'on demande.
  const base = supabase.from("list_items").select("id, raw_fr", { count: "exact" }).is("term_id", null);

  const borne = listId === null ? base : propre ? base.eq("list_id", listId) : base.neq("list_id", listId);

  const { data, count, error } = await borne
    .limit(PLAFOND_AUTRES)
    .returns<{ id: string; raw_fr: string }[]>();

  if (error) {
    console.error("rattacher lecture", error.code, error.message);
    return { touchees: 0, ok: false };
  }

  const lignes = data ?? [];

  // Une troncature sur la liste de l'appelant serait un vrai problème — sa
  // ligne peut être celle qui manque. Elle ne devrait jamais arriver : une
  // liste de courses n'a pas mille lignes non traduites. Si ça arrive, on le
  // dit, et `ok` passe à faux pour que la réponse ne mente pas.
  const tronquee = (count ?? lignes.length) > lignes.length;
  if (tronquee) {
    console.warn(`rattacher : ${count} ligne(s) à examiner, ${lignes.length} reçue(s) — rattrapage partiel`);
    if (propre) return { touchees: 0, ok: false };
  }

  const ids = lignes.filter((ligne) => normalize(ligne.raw_fr) === forme).map((l) => l.id);
  if (ids.length === 0) return { touchees: 0, ok: true };

  let touchees = 0;
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT);

    const { data: faites, error: erreurMaj } = await supabase
      .from("list_items")
      .update({ term_id: termeId })
      .in("id", lot)
      // Vrai au moment du filtrage, pas forcément à l'écriture : une ligne peut
      // avoir été rattachée entre-temps par un appel concurrent, et on ne la
      // lui reprend pas.
      .is("term_id", null)
      .select("id")
      .returns<{ id: string }[]>();

    if (erreurMaj) {
      console.error("rattacher écriture", erreurMaj.code, erreurMaj.message);
      return { touchees, ok: false };
    }

    touchees += faites?.length ?? 0;
  }

  return { touchees, ok: true };
}
