import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { normalize } from "@/lib/terms";

import type { Contexte } from "../contexte";
import { echouer, repondre, SANS_LISTE } from "./reponse";

/**
 * Les outils qui enrichissent le lexique. C'est la boucle que la décision D2
 * laisse ouverte : l'application ne paie aucune traduction automatique, elle
 * affiche « traduction manquante » et compte sur Claude pour combler le trou.
 * Ce fichier est l'endroit où le trou se comble.
 *
 * Le lexique est **global** : une traduction ajoutée par un compte profite à
 * tous les suivants, et le rattachement rétroactif touche donc aussi les lignes
 * des autres comptes. C'est voulu, c'est écrit dans D2, et c'est la seule
 * écriture de tout le projet qui sorte du compte appelant.
 */

/**
 * Les rayons, dans l'ordre de l'énuméré Postgres — qui est l'ordre du magasin,
 * et qui servira au groupement du ticket 17. La liste est recopiée ici parce
 * qu'un schéma zod ne peut pas lire un type Postgres ; si l'énuméré change, ces
 * deux listes doivent changer ensemble.
 */
const RAYONS = [
  "produce",
  "bakery",
  "meat",
  "fish",
  "dairy",
  "pantry",
  "frozen",
  "snacks",
  "drinks",
  "household",
  "hygiene",
  "other",
] as const;

/**
 * Plafond du balayage rétroactif chez **les autres comptes**. Le rattachement
 * compare `normalize(raw_fr)` en TypeScript, donc il faut ramener les lignes
 * pour les comparer : il n'y a pas encore d'équivalent SQL de `normalize()`,
 * c'est précisément ce que le ticket 18 doit poser. Tant qu'il n'existe pas, on
 * borne — mais on ne borne que ce qui est de toute façon « au mieux ».
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
 * outils à identifiants de `liste.ts`.
 */
const TAILLE_LOT = 100;

/**
 * Une chaîne destinée au lexique : une seule ligne, longueur bornée.
 *
 * La base porte la même règle en contrainte (migration
 * `20260914180000_borner_la_forme_du_lexique`), et c'est elle qui protège
 * vraiment — n'importe quel compte peut écrire dans `terms` par la Data API,
 * sans passer par ici. Ce schéma existe pour que l'outil réponde une phrase
 * lisible au lieu de laisser remonter une violation de contrainte.
 */
const texteDeLexique = (quoi: string) =>
  z
    .string()
    .trim()
    .min(1, `${quoi} ne peut pas être vide`)
    .max(80, `${quoi} : 80 caractères au maximum`)
    .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), `${quoi} doit tenir sur une seule ligne`);

export function enregistrerOutilsLexique(server: McpServer, ctx: Contexte) {
  /* ---------------------------------------------------------------------- */
  /* list_missing_translations                                              */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "list_missing_translations",
    {
      title: "Lister les traductions manquantes",
      description:
        "Renvoie les produits de la liste qui n'ont pas de traduction finnoise. " +
        "Ce sont les lignes qui s'affichent en français en rayon, donc celles " +
        "qui ne servent à rien. Complète-les avec add_translation.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        manquants: z.array(z.object({ fr: z.string(), lignes: z.number() })),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (ctx.listId === null) return echouer(SANS_LISTE);

      const { data, error } = await ctx.supabase
        .from("list_items")
        .select("raw_fr")
        .eq("list_id", ctx.listId)
        .is("term_id", null)
        .order("position", { ascending: true })
        .returns<{ raw_fr: string }[]>();

      if (error) {
        console.error("mcp list_missing_translations", error.code, error.message);
        return echouer("La liste n'a pas pu être lue.");
      }

      // Regroupé par forme normalisée : « oeufs » et « des œufs » sont un seul
      // terme à traduire, pas deux, et proposer deux fois le même travail à
      // Claude produirait la seconde insertion en conflit.
      const parForme = new Map<string, { fr: string; lignes: number }>();
      for (const { raw_fr } of data ?? []) {
        const forme = normalize(raw_fr);
        const vu = parForme.get(forme);
        parForme.set(forme, { fr: vu?.fr ?? raw_fr, lignes: (vu?.lignes ?? 0) + 1 });
      }

      const manquants = [...parForme.values()];

      const texte =
        manquants.length === 0
          ? "Toutes les lignes de la liste ont leur traduction finnoise."
          : `${manquants.length} terme(s) sans traduction : ` +
            manquants.map((m) => m.fr).join(", ") +
            ".";

      return repondre(texte, { manquants });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* add_translation                                                        */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "add_translation",
    {
      title: "Ajouter une traduction au lexique",
      description:
        "Ajoute un terme au lexique français → finnois, puis rattache " +
        "automatiquement toutes les lignes de liste qui l'attendaient : elles " +
        "affichent le finnois sans que l'utilisateur ait quoi que ce soit à " +
        "faire.\n\n" +
        "Donne le **nom du produit tel qu'il est écrit en magasin en Finlande**, " +
        "pas la traduction littérale du français. « crème fraîche » se vend sous " +
        "le nom « ranskankerma » et non « kerma » ; le fromage blanc est du " +
        "« rahka ». Au singulier, sans article, comme sur l'étiquette.\n\n" +
        "Le lexique est partagé par tous les comptes : une traduction juste " +
        "sert à tout le monde, une traduction fausse aussi. Dans le doute, " +
        "n'écris rien.\n\n" +
        "Un terme déjà présent n'est jamais écrasé : l'outil renvoie l'entrée " +
        "existante et le signale.",
      inputSchema: z.object({
        fr: texteDeLexique("le terme français"),
        fi: texteDeLexique("la traduction finnoise"),
        aisle: z
          .enum(RAYONS)
          .optional()
          .describe(
            "Le rayon du magasin où se trouve le produit. À renseigner : il " +
              "sert à ranger la liste dans l'ordre du parcours.",
          ),
      }),
      outputSchema: z.object({
        cree: z.boolean(),
        fr: z.string(),
        fi: z.string(),
        aisle: z.string(),
        rattachees: z.number(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ fr, fi, aisle }) => {
      const forme = normalize(fr);
      if (forme === "") {
        return echouer("Le terme français ne donne aucune forme à indexer.");
      }

      const rayon = aisle ?? "other";

      // Insertion écrite pour **tolérer** le conflit, pas pour l'éviter : un
      // select suivi d'un insert laisse une fenêtre entre les deux, et deux
      // appels simultanés sur le même terme la trouveraient. C'est la
      // contrainte d'unicité sur `fr_normalized` qui tranche, jamais nous.
      // Voir .claude/rules/lexique.md.
      const { data: cree, error } = await ctx.supabase
        .from("terms")
        .insert({
          fr,
          fr_normalized: forme,
          fi,
          aisle: rayon,
          created_by: ctx.userId,
        })
        .select("id, fr, fi, aisle")
        .maybeSingle<{ id: string; fr: string; fi: string; aisle: string }>();

      let terme = cree;
      let nouveau = true;

      if (error) {
        // 23505 : violation d'unicité. Le terme existait déjà, ou vient d'être
        // écrit par un appel concurrent — les deux se traitent pareil.
        if (error.code !== "23505") {
          console.error("mcp add_translation", error.code, error.message);
          return echouer("L'écriture dans le lexique n'est pas passée.");
        }

        const { data: existant } = await ctx.supabase
          .from("terms")
          .select("id, fr, fi, aisle")
          .eq("fr_normalized", forme)
          .maybeSingle<{ id: string; fr: string; fi: string; aisle: string }>();

        if (!existant) {
          // Conflit sans ligne à relire : impossible en pratique, `terms` n'a
          // ni suppression ni mise à jour. Le dire plutôt que de renvoyer un
          // succès qui n'a rien écrit.
          return echouer("Le lexique a refusé l'écriture sans qu'on sache pourquoi.");
        }

        terme = existant;
        nouveau = false;
      }

      if (!terme) return echouer("L'écriture dans le lexique n'est pas passée.");

      const { propres, ok } = await rattacher(ctx, forme, terme.id);

      const entete = nouveau
        ? `Ajouté au lexique : ${terme.fr} → ${terme.fi} (rayon ${terme.aisle}).`
        : `Le lexique a déjà « ${terme.fr} » → ${terme.fi} (rayon ${terme.aisle}). ` +
          "Rien n'a été écrasé : une entrée du lexique ne se réécrit pas.";

      // Trois cas et non deux : un rattachement qui a échoué ne se raconte pas
      // comme une liste qui n'attendait rien. Le terme est dans le lexique, la
      // ligne est toujours en français, et personne ne relancerait l'opération
      // si on disait la même chose dans les deux cas.
      const suite = !ok
        ? "Le lexique est à jour, mais le rattachement des lignes existantes n'est " +
          "pas passé : redemande l'ajout du produit pour que la ligne retrouve son finnois."
        : propres === 0
          ? "Aucune ligne de la liste ne l'attendait."
          : `${propres} ligne(s) de la liste affichent maintenant le finnois.`;

      return repondre(`${entete} ${suite}`, {
        cree: nouveau,
        fr: terme.fr,
        fi: terme.fi,
        aisle: terme.aisle,
        rattachees: propres,
      });
    },
  );
}

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
 * La comparaison se fait en TypeScript, sur `normalize()`, parce que c'est la
 * seule règle du projet et qu'elle n'a pas encore d'équivalent SQL — le ticket
 * 18 doit l'écrire. D'ici là on ramène les lignes non traduites et on compare
 * ici.
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
 * part dans les journaux du serveur : dire à Claude « 3 lignes rattachées
 * ailleurs » lui apprendrait que d'autres comptes ont ce produit dans leur
 * liste, ce qui ne le regarde pas.
 */
async function rattacher(
  ctx: Contexte,
  forme: string,
  termeId: string,
): Promise<Rattachement> {
  const propres = await rattacherLot(ctx, termeId, forme, true);

  // Les autres comptes, au mieux. Une erreur ici n'est pas remontée à
  // l'appelant : ce n'est pas sa liste, et il ne peut rien y faire.
  const autres = await rattacherLot(ctx, termeId, forme, false);

  if (autres.touchees > 0) {
    console.info(
      `mcp rattacher : ${autres.touchees} ligne(s) rattachée(s) chez d'autres comptes`,
    );
  }

  return { propres: propres.touchees, ok: propres.ok };
}

/**
 * Une passe de rattachement, sur la liste de l'appelant (`propre`) ou sur
 * toutes les autres. Rendue séparée pour que les deux passes ne puissent pas
 * diverger : même lecture, même comparaison, même écriture par lots.
 */
async function rattacherLot(
  ctx: Contexte,
  termeId: string,
  forme: string,
  propre: boolean,
): Promise<{ touchees: number; ok: boolean }> {
  // Sans liste rattachée au compte — l'anomalie de provisionnement — il n'y a
  // pas de « chez soi » à traiter, et « les autres » sont tout le monde.
  if (propre && ctx.listId === null) return { touchees: 0, ok: true };

  // `count: "exact"` : le nombre total de lignes qui correspondent, à comparer
  // au nombre de lignes reçues. C'est la seule façon de voir une troncature,
  // le plafond réel étant celui du serveur et non celui qu'on demande.
  const base = ctx.supabase
    .from("list_items")
    .select("id, raw_fr", { count: "exact" })
    .is("term_id", null);

  const borne =
    ctx.listId === null
      ? base
      : propre
        ? base.eq("list_id", ctx.listId)
        : base.neq("list_id", ctx.listId);

  const { data, count, error } = await borne
    .limit(PLAFOND_AUTRES)
    .returns<{ id: string; raw_fr: string }[]>();

  if (error) {
    console.error("mcp rattacher lecture", error.code, error.message);
    return { touchees: 0, ok: false };
  }

  const lignes = data ?? [];

  // Une troncature sur la liste de l'appelant serait un vrai problème — sa
  // ligne peut être celle qui manque. Elle ne devrait jamais arriver : une
  // liste de courses n'a pas mille lignes non traduites. Si ça arrive, on le
  // dit, et `ok` passe à faux pour que la réponse ne mente pas.
  const tronquee = (count ?? lignes.length) > lignes.length;
  if (tronquee) {
    console.warn(
      `mcp rattacher : ${count} ligne(s) à examiner, ${lignes.length} reçue(s) — rattrapage partiel`,
    );
    if (propre) return { touchees: 0, ok: false };
  }

  const ids = lignes.filter((ligne) => normalize(ligne.raw_fr) === forme).map((l) => l.id);
  if (ids.length === 0) return { touchees: 0, ok: true };

  let touchees = 0;
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT);

    const { data: faites, error: erreurMaj } = await ctx.supabase
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
      console.error("mcp rattacher écriture", erreurMaj.code, erreurMaj.message);
      return { touchees, ok: false };
    }

    touchees += faites?.length ?? 0;
  }

  return { touchees, ok: true };
}
