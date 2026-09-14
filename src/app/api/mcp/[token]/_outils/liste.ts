import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { parseEntry } from "@/lib/saisie";
import { normalize, resolveTermes } from "@/lib/terms";

import type { Contexte } from "../contexte";
import { echouer, ouRien, repondre, SANS_LISTE } from "./reponse";

/**
 * Les outils qui manipulent la liste. C'est la fonctionnalité qui motive le
 * projet : coller une recette dans Claude et retrouver les ingrédients en
 * rayon, en finnois.
 *
 * Rappel des deux règles de la route, qui s'appliquent à chaque requête écrite
 * ici : le client contourne RLS, donc **chaque requête porte son filtre de
 * liste** ; et tout argument reçu est une entrée utilisateur, donc validé par
 * un schéma. Un identifiant d'item envoyé par Claude n'est pas une autorisation.
 */

/** Une ligne telle que la base la rend, jointure du lexique comprise. */
type Ligne = {
  id: string;
  raw_fr: string;
  quantity: string | null;
  checked: boolean;
  position: number;
  terme: { fr: string; fi: string; aisle: string } | null;
};

/**
 * Lecture des lignes d'une liste. L'ordre est celui de `position` : `created_at`
 * ne suffirait pas, c'est l'heure de **début de transaction**, donc tous les
 * items d'une recette ajoutée d'un coup la partagent à la microseconde près et
 * l'ordre de la recette serait perdu. Voir REX-M1.
 */
async function lireLignes(ctx: Contexte, listId: string): Promise<Ligne[] | null> {
  const { data, error } = await ctx.supabase
    .from("list_items")
    .select("id, raw_fr, quantity, checked, position, terme:terms (fr, fi, aisle)")
    .eq("list_id", listId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<Ligne[]>();

  if (error) {
    console.error("mcp lireLignes", error.code, error.message);
    return null;
  }

  return data ?? [];
}

/** Le schéma d'une ligne rendue à Claude. Partagé par get_list et add_items. */
const ligneSchema = z.object({
  id: z.string(),
  fr: z.string(),
  fi: ouRien(z.string()),
  quantity: ouRien(z.string()),
  aisle: ouRien(z.string()),
  checked: z.boolean(),
});

function enSortie(ligne: Ligne) {
  return {
    id: ligne.id,
    fr: ligne.raw_fr,
    fi: ligne.terme?.fi ?? null,
    quantity: ligne.quantity,
    aisle: ligne.terme?.aisle ?? null,
    checked: ligne.checked,
  };
}

/**
 * Rendu texte d'une ligne. Le finnois d'abord, comme à l'écran (décision D4) :
 * c'est le mot utile en rayon, et c'est celui que Claude doit citer quand il
 * répond.
 */
function enTexte(ligne: { fr: string; fi: string | null; quantity: string | null; checked: boolean }): string {
  const coche = ligne.checked ? "[x]" : "[ ]";
  const quantite = ligne.quantity ? ` (${ligne.quantity})` : "";
  const fi = ligne.fi ? `${ligne.fi} — ` : "";
  const manque = ligne.fi ? "" : " — traduction manquante";
  return `${coche} ${fi}${ligne.fr}${quantite}${manque}`;
}

/**
 * Sépare ce que Claude envoie en « quantité » et « produit », par la même
 * analyse que la saisie à l'écran.
 *
 * Deux passages, et le second est celui qui compte. Claude range volontiers le
 * conditionnement du côté du produit : `{ quantity: "1", fr: "gousse d'ail" }`.
 * Pris tel quel, le lexique cherche « gousse d'ail » et ne trouve rien, alors
 * que « ail » y est. Recoller les deux morceaux — « 1 gousse d'ail » — redonne
 * exactement la ligne qu'un humain aurait tapée, que `parseEntry` sait déjà
 * découper en « 1 gousse » et « ail ».
 *
 * Le recollage n'est retenu que s'il **produit** une quantité. Une quantité en
 * toutes lettres, « quelques tomates », ne s'analyse pas : la retenir ferait du
 * produit « quelques tomates », introuvable. Dans ce cas on garde ce que Claude
 * a dit, chacun de son côté.
 */
function separer(item: { fr: string; quantity?: string }): {
  quantite: string | null;
  produit: string;
} {
  const seul = parseEntry(item.fr);

  if (item.quantity) {
    const recolle = parseEntry(`${item.quantity} ${item.fr}`);
    if (recolle.quantite !== "") {
      return { quantite: recolle.quantite, produit: recolle.produit };
    }
    return { quantite: item.quantity, produit: seul.produit };
  }

  return { quantite: seul.quantite || null, produit: seul.produit };
}

/* -------------------------------------------------------------------------- */

export function enregistrerOutilsListe(server: McpServer, ctx: Contexte) {
  /* ---------------------------------------------------------------------- */
  /* get_list                                                               */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_list",
    {
      title: "Lire la liste",
      description:
        "Renvoie la liste de courses complète : pour chaque ligne, son " +
        "identifiant, le français saisi, le finnois quand il est connu, la " +
        "quantité, le rayon et l'état coché. Les identifiants renvoyés ici sont " +
        "ceux qu'attendent check_items, uncheck_items et remove_items.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        liste: z.string(),
        items: z.array(ligneSchema),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (ctx.listId === null) return echouer(SANS_LISTE);

      const { data: liste } = await ctx.supabase
        .from("lists")
        .select("id, name")
        .eq("id", ctx.listId)
        .eq("owner_id", ctx.userId)
        .maybeSingle<{ id: string; name: string }>();

      if (!liste) return echouer("La liste n'a pas pu être lue.");

      const lignes = await lireLignes(ctx, liste.id);
      if (lignes === null) return echouer("La liste n'a pas pu être lue.");

      const texte =
        lignes.length === 0
          ? `La liste « ${liste.name} » est vide.`
          : `Liste « ${liste.name} », ${lignes.length} ligne(s) :\n` +
            lignes.map((l) => enTexte(enSortie(l))).join("\n");

      return repondre(texte, { liste: liste.name, items: lignes.map(enSortie) });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* add_items                                                              */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "add_items",
    {
      title: "Ajouter des produits",
      description:
        "Ajoute des produits à la liste de courses, tous en un seul appel — " +
        "pour une recette, envoie tous les ingrédients d'un coup et non un par " +
        "appel.\n\n" +
        "Écris chaque produit **au singulier et sans préparation** : « oignon » " +
        "et non « oignons émincés », « tomate » et non « tomates coupées en " +
        "dés ». Le lexique traduit des produits tels qu'on les trouve en rayon, " +
        "pas des étapes de recette.\n\n" +
        "La quantité est du texte libre, tel qu'on le lit devant le rayon : " +
        "« 500 g », « 2 », « 1 paquet ». Laisse-la vide si la recette n'en " +
        "donne pas.\n\n" +
        "Un produit déjà présent dans la liste n'est jamais dupliqué : sa " +
        "quantité est mise à jour et la ligne redevient à acheter.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              fr: z
                .string()
                .trim()
                .min(1, "le produit ne peut pas être vide")
                .max(120, "produit trop long"),
              quantity: z.string().trim().max(40, "quantité trop longue").optional(),
            }),
          )
          .min(1, "au moins un produit")
          .max(50, "cinquante produits au maximum en un appel"),
      }),
      outputSchema: z.object({
        ajoutes: z.number(),
        mis_a_jour: z.number(),
        sans_traduction: z.array(z.string()),
        items: z.array(
          ligneSchema.extend({
            missing_translation: z.boolean(),
            statut: z.enum(["ajouté", "mis à jour"]),
          }),
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ items }) => {
      if (ctx.listId === null) return echouer(SANS_LISTE);
      const listId = ctx.listId;

      const existantes = await lireLignes(ctx, listId);
      if (existantes === null) return echouer("La liste n'a pas pu être lue.");

      /**
       * Les lignes déjà là, rangées par forme normalisée. La première gagne :
       * s'il y a déjà un doublon en base — créé avant cette règle, ou depuis
       * l'écran, qui ne dédoublonne pas — on met à jour le plus ancien plutôt
       * que d'en ajouter un troisième.
       */
      const deja = new Map<string, Ligne>();
      for (const ligne of existantes) {
        const forme = normalize(ligne.raw_fr);
        if (!deja.has(forme)) deja.set(forme, ligne);
      }

      /**
       * Le lot est dédoublonné avant d'écrire : une recette cite volontiers le
       * même ingrédient deux fois (« œufs » pour la pâte, « œuf » pour la
       * dorure). La dernière quantité l'emporte, c'est généralement la plus
       * complète.
       */
      const demandes = new Map<string, { produit: string; quantite: string | null }>();
      for (const item of items) {
        const { quantite, produit } = separer(item);
        const forme = normalize(produit);
        const precedente = demandes.get(forme);
        demandes.set(forme, {
          produit: precedente?.produit ?? produit,
          quantite: quantite ?? precedente?.quantite ?? null,
        });
      }

      const termes = await resolveTermes(
        ctx.supabase,
        [...demandes.values()].map((d) => d.produit),
      );

      // La position se lit une fois, puis s'incrémente en mémoire. Un
      // déclencheur ne peut pas le faire : un `before insert` ne voit pas les
      // autres lignes insérées par la même commande, et l'ordre de la recette
      // serait perdu. Voir REX-M1.
      let position = existantes.reduce((max, l) => Math.max(max, l.position), 0);

      const aInserer: {
        list_id: string;
        raw_fr: string;
        quantity: string | null;
        term_id: string | null;
        position: number;
      }[] = [];
      const aMettreAJour: { ligne: Ligne; quantite: string | null; termeId: string | null }[] = [];

      for (const [forme, demande] of demandes) {
        const terme = termes.get(forme) ?? null;
        const existante = deja.get(forme);

        if (existante) {
          aMettreAJour.push({
            ligne: existante,
            quantite: demande.quantite,
            // Rattachement au passage : la ligne avait été créée sans
            // traduction, le terme existe maintenant. C'est gratuit ici.
            termeId: existante.terme === null ? (terme?.id ?? null) : null,
          });
        } else {
          aInserer.push({
            list_id: listId,
            // Le produit est conservé tel que Claude l'a écrit, jamais sa forme
            // normalisée : c'est ce que l'utilisateur relira à l'écran.
            raw_fr: demande.produit,
            quantity: demande.quantite,
            term_id: terme?.id ?? null,
            position: ++position,
          });
        }
      }

      const ajoutees: Ligne[] = [];
      if (aInserer.length > 0) {
        const { data, error } = await ctx.supabase
          .from("list_items")
          .insert(aInserer)
          .select("id, raw_fr, quantity, checked, position, terme:terms (fr, fi, aisle)")
          .returns<Ligne[]>();

        if (error) {
          console.error("mcp add_items insert", error.code, error.message);
          return echouer("L'ajout n'est pas passé. Aucune ligne n'a été créée.");
        }
        ajoutees.push(...(data ?? []));
      }

      const majees: Ligne[] = [];
      for (const { ligne, quantite, termeId } of aMettreAJour) {
        const { data, error } = await ctx.supabase
          .from("list_items")
          .update({
            // Une quantité absente ne remplace pas celle qui est là : ajouter
            // « farine » sans quantité à une ligne « farine, 500 g » ne doit
            // pas effacer les 500 g.
            ...(quantite !== null ? { quantity: quantite } : {}),
            ...(termeId !== null ? { term_id: termeId } : {}),
            // La ligne redevient à acheter. Un produit redemandé alors qu'il
            // était coché est un produit qu'il faut racheter ; le laisser coché
            // le renverrait en bas de l'écran, barré, et il ne serait pas acheté.
            checked: false,
          })
          .eq("id", ligne.id)
          .eq("list_id", listId)
          .select("id, raw_fr, quantity, checked, position, terme:terms (fr, fi, aisle)")
          .returns<Ligne[]>();

        if (error) {
          console.error("mcp add_items update", error.code, error.message);
          continue;
        }
        majees.push(...(data ?? []));
      }

      // Trié par position, donc dans l'ordre de la liste — et pour un lot
      // d'ajouts, dans l'ordre de la recette. Un `insert ... returning` rend
      // ses lignes dans l'ordre qui l'arrange, ce qui donnerait à Claude une
      // récapitulation mélangée d'un appel à l'autre.
      const sortie = [
        ...ajoutees.map((l) => ({ ligne: l, statut: "ajouté" as const })),
        ...majees.map((l) => ({ ligne: l, statut: "mis à jour" as const })),
      ]
        .sort((a, b) => a.ligne.position - b.ligne.position)
        .map(({ ligne, statut }) => ({
          ...enSortie(ligne),
          missing_translation: ligne.terme === null,
          statut,
        }));

      const sansTraduction = sortie.filter((l) => l.missing_translation).map((l) => l.fr);

      // L'énumération des termes non traduits est explicite et nommée, pas un
      // compte : « 3 termes sans traduction » n'apprend rien à Claude, qui ne
      // saurait pas lesquels compléter.
      const texte = [
        `${ajoutees.length} ligne(s) ajoutée(s), ${majees.length} mise(s) à jour.`,
        ...sortie.map((l) => `${l.statut} : ${enTexte(l)}`),
        sansTraduction.length > 0
          ? `Sans traduction : ${sansTraduction.join(", ")}. Ces lignes s'affichent en français, en attendant qu'une traduction soit ajoutée au lexique.`
          : "Toutes les lignes ont leur traduction finnoise.",
      ].join("\n");

      return repondre(texte, {
        ajoutes: ajoutees.length,
        mis_a_jour: majees.length,
        sans_traduction: sansTraduction,
        items: sortie,
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* check_items, uncheck_items, remove_items                               */
  /* ---------------------------------------------------------------------- */

  const idsSchema = z.object({
    ids: z
      .array(z.uuid("identifiant d'item invalide"))
      .min(1, "au moins un identifiant")
      .max(100, "cent identifiants au maximum en un appel"),
  });

  const sortieIds = z.object({
    touches: z.number(),
    inconnus: z.array(z.string()),
  });

  /**
   * Le tronc commun des trois outils à identifiants. Le filtre sur `list_id`
   * est la barrière : un identifiant qui appartient à un autre compte ne touche
   * rien, et ressort simplement comme inconnu. Rien dans la réponse ne permet
   * de distinguer « n'existe pas » de « existe ailleurs ».
   */
  async function surIds(
    ids: string[],
    action: (listId: string, ids: string[]) => PromiseLike<{ data: { id: string }[] | null; error: { code: string; message: string } | null }>,
    verbe: string,
  ) {
    if (ctx.listId === null) return echouer(SANS_LISTE);

    const { data, error } = await action(ctx.listId, ids);

    if (error) {
      console.error(`mcp ${verbe}`, error.code, error.message);
      return echouer(`L'opération « ${verbe} » n'est pas passée.`);
    }

    const touches = data ?? [];
    const inconnus = ids.filter((id) => !touches.some((ligne) => ligne.id === id));

    const texte =
      `${touches.length} ligne(s) ${verbe}.` +
      (inconnus.length > 0
        ? ` ${inconnus.length} identifiant(s) sans correspondance dans cette liste — relis-la avec get_list, elle a pu changer.`
        : "");

    return repondre(texte, { touches: touches.length, inconnus });
  }

  server.registerTool(
    "check_items",
    {
      title: "Cocher des produits",
      description:
        "Coche des lignes de la liste, c'est-à-dire les marque comme achetées. " +
        "Les identifiants viennent de get_list.",
      inputSchema: idsSchema,
      outputSchema: sortieIds,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ ids }) =>
      surIds(
        ids,
        (listId, liste) =>
          ctx.supabase
            .from("list_items")
            .update({ checked: true })
            .in("id", liste)
            .eq("list_id", listId)
            .select("id"),
        "cochée(s)",
      ),
  );

  server.registerTool(
    "uncheck_items",
    {
      title: "Décocher des produits",
      description:
        "Décoche des lignes de la liste : elles redeviennent à acheter. " +
        "Les identifiants viennent de get_list.",
      inputSchema: idsSchema,
      outputSchema: sortieIds,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ ids }) =>
      surIds(
        ids,
        (listId, liste) =>
          ctx.supabase
            .from("list_items")
            .update({ checked: false })
            .in("id", liste)
            .eq("list_id", listId)
            .select("id"),
        "décochée(s)",
      ),
  );

  server.registerTool(
    "remove_items",
    {
      title: "Retirer des produits",
      description:
        "Retire définitivement des lignes de la liste. Pour marquer un produit " +
        "comme acheté, utilise check_items : retirer une ligne la fait " +
        "disparaître, et elle ne se récupère pas.",
      inputSchema: idsSchema,
      outputSchema: sortieIds,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ ids }) =>
      surIds(
        ids,
        (listId, liste) =>
          ctx.supabase
            .from("list_items")
            .delete()
            .in("id", liste)
            .eq("list_id", listId)
            .select("id"),
        "retirée(s)",
      ),
  );

  /* ---------------------------------------------------------------------- */
  /* clear_checked                                                          */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "clear_checked",
    {
      title: "Vider les lignes cochées",
      description:
        "Retire de la liste toutes les lignes déjà cochées, c'est-à-dire les " +
        "produits achetés. Ne touche pas aux lignes qui restent à acheter.",
      inputSchema: z.object({}),
      outputSchema: z.object({ retirees: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async () => {
      if (ctx.listId === null) return echouer(SANS_LISTE);

      const { data, error } = await ctx.supabase
        .from("list_items")
        .delete()
        .eq("list_id", ctx.listId)
        .eq("checked", true)
        .select("id");

      if (error) {
        console.error("mcp clear_checked", error.code, error.message);
        return echouer("Le vidage n'est pas passé.");
      }

      const retirees = data?.length ?? 0;
      return repondre(
        retirees === 0
          ? "Aucune ligne cochée à retirer."
          : `${retirees} ligne(s) cochée(s) retirée(s).`,
        { retirees },
      );
    },
  );
}
