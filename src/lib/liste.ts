import { createClient } from "@/lib/supabase/server";

/**
 * Lecture de la liste, côté serveur.
 *
 * Aucun filtre sur le compte n'est écrit ici, et c'est volontaire : ce client
 * porte la clé publiable et l'identité de l'utilisateur, donc les politiques
 * RLS font le filtrage en base. Un filtre applicatif en plus donnerait
 * l'illusion que c'est lui qui protège. La règle s'inversera à la route du
 * connecteur, qui travaille avec la clé secrète et doit tout filtrer à la main.
 */

/** Une ligne de la liste, telle que l'écran l'affiche. */
export type Ligne = {
  id: string;
  raw_fr: string;
  quantity: string | null;
  checked: boolean;
  created_at: string;
  /** Absent quand la traduction manque. C'est le seul état à gérer (D2). */
  terme: { fr: string; fi: string; aisle: string } | null;
};

export type Liste = {
  id: string;
  name: string;
  lignes: Ligne[];
};

export async function chargerListe(): Promise<Liste | null> {
  const supabase = await createClient();

  const { data: liste } = await supabase
    .from("lists")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();

  if (!liste) return null;

  // `terms` est renommé `terme` par la requête : au singulier, parce qu'un item
  // pointe vers un terme et pas vers plusieurs, et en français pour ne pas
  // avoir deux conventions dans le même composant.
  //
  // L'ordre est celui de `position`, que l'insertion incrémente. `created_at`
  // ne suffirait pas comme ordre principal : c'est l'heure de début de
  // transaction, donc plusieurs items ajoutés d'un coup — ce que fera le
  // connecteur en lisant une recette — la partageraient au microseconde près.
  const { data: lignes } = await supabase
    .from("list_items")
    .select("id, raw_fr, quantity, checked, created_at, terme:terms (fr, fi, aisle)")
    .eq("list_id", liste.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<Ligne[]>();

  return { ...liste, lignes: lignes ?? [] };
}
