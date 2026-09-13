"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { resolveTerm } from "@/lib/terms";

export type ResultatAjout = { ok: true } | { ok: false; message: string };

/**
 * 120 caractères : largement au-dessus du plus long terme du lexique, et assez
 * bas pour qu'une saisie collée par accident ne devienne pas une ligne de liste.
 */
const schema = z.object({
  texte: z.string().trim().min(1, "Écris un produit").max(120, "Saisie trop longue"),
});

/**
 * Ajoute un item à la liste du compte connecté.
 *
 * L'identifiant de liste n'est jamais reçu du client : il est relu ici depuis
 * la session. Un identifiant venu du navigateur serait une donnée à vérifier,
 * pas une autorisation — et cette vérification, on l'a déjà en relisant.
 */
export async function ajouterItem(texte: string): Promise<ResultatAjout> {
  const analyse = schema.safeParse({ texte });
  if (!analyse.success) {
    return { ok: false, message: analyse.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: liste } = await supabase
    .from("lists")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!liste) {
    // RLS ne renvoie rien plutôt qu'une erreur quand il n'y a pas de session :
    // les deux cas se traitent pareil, l'écran demandera de se reconnecter.
    return { ok: false, message: "Liste introuvable. Reconnecte-toi." };
  }

  const terme = await resolveTerm(supabase, analyse.data.texte);

  // La position se lit juste avant d'écrire. Deux ajouts simultanés peuvent
  // tomber sur la même : `created_at` départage alors, et l'ordre reste celui
  // de l'ajout. Une séquence en base serait plus solide, mais elle
  // s'appliquerait à toutes les listes à la fois et casserait la numérotation
  // par liste.
  const { data: derniere } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", liste.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const { error } = await supabase.from("list_items").insert({
    list_id: liste.id,
    // Le texte saisi est conservé tel quel, jamais la forme normalisée :
    // l'utilisateur doit se relire. La normalisation ne sert qu'à retrouver le
    // terme.
    raw_fr: analyse.data.texte,
    term_id: terme?.id ?? null,
    position: (derniere?.position ?? 0) + 1,
  });

  if (error) {
    console.error("ajouterItem", error.code, error.message);
    return { ok: false, message: "L'ajout n'est pas passé. Réessaie." };
  }

  revalidatePath("/");
  return { ok: true };
}
