import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { Contexte } from "./contexte";

/**
 * Outils exposés à Claude.
 *
 * Deux règles, valables pour tout ce qui s'ajoutera ici :
 *
 * 1. **Chaque requête porte son filtre de compte, écrit sur place.** Le client
 *    du contexte utilise la clé secrète et contourne RLS. Ne jamais s'en
 *    remettre à un filtre appliqué plus haut, ni à un identifiant reçu dans les
 *    arguments d'un outil.
 * 2. **Tout argument est une entrée utilisateur**, validée par un schéma zod.
 *    Ce que Claude envoie n'est pas plus digne de confiance qu'un formulaire.
 */

/**
 * « Ce champ ou rien », en `anyOf` plutôt qu'en `z.nullable()`.
 *
 * `z.nullable()` produit `"type": ["string", "null"]`, une forme légale de JSON
 * Schema que plusieurs clients MCP lisent mal : ils attendent un `type` simple,
 * et selon les cas rejettent l'outil ou laissent tomber la contrainte.
 * L'inspecteur le signale en `--strict`. `anyOf` dit la même chose partout.
 */
function ouRien<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.null()]);
}

/** Réponse d'outil au format attendu, avec la même donnée des deux côtés. */
function repondre(texte: string, structure?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: texte }],
    ...(structure ? { structuredContent: structure } : {}),
  };
}

export function enregistrerOutils(server: McpServer, ctx: Contexte) {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description:
        "Vérifie que le connecteur répond et que la liste de courses du compte " +
        "est accessible. N'écrit rien. À utiliser pour diagnostiquer, pas pour " +
        "lire la liste.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        ok: z.boolean(),
        liste: ouRien(z.string()),
        items: ouRien(z.number()),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (ctx.listId === null) {
        // Le jeton est bon, c'est le provisionnement qui manque. Le dire plutôt
        // que renvoyer une liste vide : une liste vide se lit « tu n'as rien à
        // acheter », ce qui enverrait chercher le problème du mauvais côté.
        return repondre(
          "Le jeton est valide, mais aucune liste n'est rattachée à ce compte. " +
            "C'est une anomalie de provisionnement, pas une liste vide.",
          { ok: false, liste: null, items: null },
        );
      }

      // Deux filtres pour une seule ligne, et ce n'est pas redondant : `id`
      // dit quelle liste, `owner_id` dit à qui elle est. Sans le second, un
      // identifiant de liste devenu faux par un bug d'en amont lirait la liste
      // d'un autre compte — la clé secrète ne s'y opposerait pas.
      const { data: liste, error } = await ctx.supabase
        .from("lists")
        .select("id, name")
        .eq("id", ctx.listId)
        .eq("owner_id", ctx.userId)
        .maybeSingle<{ id: string; name: string }>();

      if (error || !liste) {
        console.error("mcp ping", error?.code, error?.message);
        return repondre("La liste n'a pas pu être lue.", {
          ok: false,
          liste: null,
          items: null,
        });
      }

      // `count: "exact"` avec `head: false` : on veut un GET. Une requête HEAD
      // vers une table absente renvoie un 204 sans erreur côté postgrest-js,
      // donc un comptage qui passerait pour la mauvaise raison. Voir REX-M0.
      const { count, error: erreurCompte } = await ctx.supabase
        .from("list_items")
        .select("id", { count: "exact" })
        .eq("list_id", liste.id);

      if (erreurCompte) {
        console.error("mcp ping compte", erreurCompte.code, erreurCompte.message);
      }

      return repondre(
        `Connecteur en ligne. Liste « ${liste.name} », ${count ?? 0} ligne(s).`,
        { ok: true, liste: liste.name, items: count ?? 0 },
      );
    },
  );
}
