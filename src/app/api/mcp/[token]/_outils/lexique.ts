import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { CODES_RAYONS, ajouterAuLexique, regrouperManquants, texteDeLexique } from "@/lib/lexique";

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

// Ce qui est commun à l'écran de lexique et au connecteur — schémas, insertion
// tolérante au conflit, rattachement rétroactif — vit dans src/lib/lexique.ts
// depuis le ticket 16. Ce fichier ne garde que le câblage des outils et leurs
// phrases de réponse.

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
      const manquants = regrouperManquants(data ?? []).map(({ fr, lignes }) => ({ fr, lignes }));

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
          .enum(CODES_RAYONS)
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
      const resultat = await ajouterAuLexique(ctx.supabase, {
        fr,
        fi,
        aisle: aisle ?? "other",
        userId: ctx.userId,
        listId: ctx.listId,
      });
      if (!resultat.ok) return echouer(resultat.message);

      const { cree: nouveau, terme, rattachees: propres, rattachementOk: ok } = resultat;

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
