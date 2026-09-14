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
 * Plafond du balayage rétroactif. Le rattachement compare `normalize(raw_fr)`
 * en TypeScript, donc il faut ramener les lignes pour les comparer : il n'y a
 * pas encore d'équivalent SQL de `normalize()`, c'est précisément ce que le
 * ticket 18 doit poser. Tant qu'il n'existe pas, on borne.
 */
const PLAFOND_RATTRAPAGE = 2000;

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

      const rattachees = await rattacher(ctx, forme, terme.id);

      const entete = nouveau
        ? `Ajouté au lexique : ${terme.fr} → ${terme.fi} (rayon ${terme.aisle}).`
        : `Le lexique a déjà « ${terme.fr} » → ${terme.fi} (rayon ${terme.aisle}). ` +
          "Rien n'a été écrasé : une entrée du lexique ne se réécrit pas.";

      const suite =
        rattachees === 0
          ? "Aucune ligne de la liste ne l'attendait."
          : `${rattachees} ligne(s) de la liste affichent maintenant le finnois.`;

      return repondre(`${entete} ${suite}`, {
        cree: nouveau,
        fr: terme.fr,
        fi: terme.fi,
        aisle: terme.aisle,
        rattachees,
      });
    },
  );
}

/**
 * Rattache rétroactivement les lignes qui attendaient ce terme, **tous comptes
 * confondus** : c'est la moitié utile de la décision D2, une traduction ajoutée
 * par quelqu'un doit réparer les listes de tout le monde.
 *
 * La comparaison se fait en TypeScript, sur `normalize()`, parce que c'est la
 * seule règle du projet et qu'elle n'a pas encore d'équivalent SQL — le ticket
 * 18 doit l'écrire. D'ici là on ramène les lignes non traduites et on compare
 * ici, sous plafond.
 *
 * **Le nombre rendu ne compte que les lignes du compte appelant.** Le total, y
 * compris les lignes des autres, part dans les journaux du serveur : dire à
 * Claude « 3 lignes rattachées ailleurs » lui apprendrait que d'autres comptes
 * ont ce produit dans leur liste, ce qui ne le regarde pas.
 */
async function rattacher(ctx: Contexte, forme: string, termeId: string): Promise<number> {
  const { data, error } = await ctx.supabase
    .from("list_items")
    .select("id, list_id, raw_fr")
    .is("term_id", null)
    .limit(PLAFOND_RATTRAPAGE)
    .returns<{ id: string; list_id: string; raw_fr: string }[]>();

  if (error) {
    console.error("mcp rattacher lecture", error.code, error.message);
    return 0;
  }

  const lignes = data ?? [];
  if (lignes.length === PLAFOND_RATTRAPAGE) {
    console.warn("mcp rattacher : plafond atteint, rattrapage possiblement partiel");
  }

  const aRattacher = lignes.filter((ligne) => normalize(ligne.raw_fr) === forme);
  if (aRattacher.length === 0) return 0;

  const { data: touchees, error: erreurMaj } = await ctx.supabase
    .from("list_items")
    .update({ term_id: termeId })
    .in(
      "id",
      aRattacher.map((ligne) => ligne.id),
    )
    // Toujours vrai au moment du filtrage, pas forcément à l'écriture : une
    // ligne peut avoir été rattachée entre-temps par un appel concurrent, et
    // on ne la lui reprend pas.
    .is("term_id", null)
    .select("id, list_id")
    .returns<{ id: string; list_id: string }[]>();

  if (erreurMaj) {
    console.error("mcp rattacher écriture", erreurMaj.code, erreurMaj.message);
    return 0;
  }

  const total = touchees?.length ?? 0;
  const propres = (touchees ?? []).filter((l) => l.list_id === ctx.listId).length;

  if (total !== propres) {
    console.info(`mcp rattacher : ${total} ligne(s) rattachée(s), dont ${propres} au compte appelant`);
  }

  return propres;
}
