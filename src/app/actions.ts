"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseEntry } from "@/lib/saisie";
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

  // La quantité est détachée avant d'interroger le lexique : « 500g de farine »
  // n'y est pas, « farine » oui.
  const { quantite, produit } = parseEntry(analyse.data.texte);

  const terme = await resolveTerm(supabase, produit);

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
    // Le produit est conservé tel que tapé, jamais sa forme normalisée :
    // l'utilisateur doit se relire. La normalisation ne sert qu'à retrouver le
    // terme.
    raw_fr: produit,
    // `null` et non chaîne vide : c'est ce que la colonne attend quand il n'y
    // a pas de quantité, et l'écran n'affiche alors rien du tout.
    quantity: quantite === "" ? null : quantite,
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

/* -------------------------------------------------------------------------- */
/* Cocher, supprimer, vider                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Aucune de ces trois opérations ne filtre sur le compte, et c'est délibéré :
 * le client porte l'identité de l'utilisateur, donc RLS refuse en base tout
 * item qui n'est pas le sien. Un filtre applicatif en plus ne protégerait rien
 * de nouveau et laisserait croire que c'est lui la barrière.
 *
 * Les trois sont **idempotentes**, ce qui n'est pas un détail de style : le
 * client les rejoue quand le réseau tombe, et rejouer « coche cet item » ou
 * « supprime cet item » ne peut pas faire de dégât, là où rejouer un ajout
 * créerait un doublon. C'est pour ça que `ajouterItem` n'est pas rejoué.
 */

const identifiant = z.uuid("Identifiant invalide");

export async function basculerCoche(id: string, coche: boolean): Promise<ResultatAjout> {
  const analyse = identifiant.safeParse(id);
  if (!analyse.success) return { ok: false, message: "Identifiant invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ checked: coche })
    .eq("id", analyse.data);

  if (error) {
    console.error("basculerCoche", error.code, error.message);
    return { ok: false, message: "La coche n'a pas été enregistrée." };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function supprimerItem(id: string): Promise<ResultatAjout> {
  const analyse = identifiant.safeParse(id);
  if (!analyse.success) return { ok: false, message: "Identifiant invalide" };

  const supabase = await createClient();
  const { error } = await supabase.from("list_items").delete().eq("id", analyse.data);

  if (error) {
    console.error("supprimerItem", error.code, error.message);
    return { ok: false, message: "La suppression n'est pas passée." };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function viderCoches(): Promise<ResultatAjout> {
  const supabase = await createClient();

  // `eq("checked", true)` sans identifiant de liste : RLS borne la suppression
  // aux items du compte. En v1 il n'y a qu'une liste par compte ; le jour où il
  // y en aura plusieurs, il faudra ajouter le filtre de liste ici.
  const { error } = await supabase.from("list_items").delete().eq("checked", true);

  if (error) {
    console.error("viderCoches", error.code, error.message);
    return { ok: false, message: "Le vidage n'est pas passé." };
  }

  revalidatePath("/");
  return { ok: true };
}
