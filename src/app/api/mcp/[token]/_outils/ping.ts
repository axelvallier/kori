import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { Contexte } from "../contexte";
import { echouer, repondre, SANS_LISTE } from "./reponse";

/**
 * L'outil qui ne sert qu'à prouver que la chaîne tient : jeton résolu, compte
 * établi, liste atteinte, base lue. Quand quelque chose ne marche pas, c'est
 * par lui qu'on commence.
 */
export function enregistrerPing(server: McpServer, ctx: Contexte) {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description:
        "Vérifie que le connecteur répond et que la liste de courses du compte " +
        "est accessible. N'écrit rien. À utiliser pour diagnostiquer, pas pour " +
        "lire la liste : get_list est fait pour ça.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        ok: z.boolean(),
        liste: z.string(),
        items: z.number(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (ctx.listId === null) return echouer(SANS_LISTE);

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
        return echouer("La liste n'a pas pu être lue.");
      }

      // `count: "exact"` sur un select et non un HEAD : une requête HEAD vers
      // une table absente renvoie un 204 sans erreur côté postgrest-js, donc un
      // comptage qui passerait pour la mauvaise raison. Voir REX-M0.
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
