"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CODES_RAYONS, ajouterAuLexique, texteDeLexique } from "@/lib/lexique";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ResultatTraduction =
  | { ok: true; fr: string; fi: string; cree: boolean; rattachees: number; rattachementOk: boolean }
  | { ok: false; message: string };

/**
 * Les mêmes règles que l'outil `add_translation` du connecteur, parce que
 * c'est le même schéma qui les porte. Le rayon est obligatoire ici : l'écran
 * a un sélecteur sous le doigt, Claude n'en a pas toujours l'information.
 */
const schema = z.object({
  fr: texteDeLexique("Le terme français"),
  fi: texteDeLexique("Le finnois"),
  aisle: z.enum(CODES_RAYONS, "Choisis un rayon"),
});

/**
 * Ajoute une traduction depuis l'écran de lexique, puis rattache les lignes
 * qui l'attendaient — celles de ce compte d'abord, celles des autres ensuite,
 * exactement comme le connecteur (D2, D8).
 *
 * Deux clients, et la frontière entre les deux est le point à relire :
 *
 * - le client de session, borné par RLS, établit **qui** appelle et **quelle**
 *   liste est la sienne. Rien de ce qui vient du navigateur n'est cru ;
 * - le client de service, clé secrète, fait l'écriture : le rattachement doit
 *   atteindre les lignes des autres comptes, ce qu'aucune politique ne permet.
 *   Il ne reçoit que ce que le premier a établi.
 */
export async function ajouterTraduction(entree: {
  fr: string;
  fi: string;
  aisle: string;
}): Promise<ResultatTraduction> {
  const analyse = schema.safeParse(entree);
  if (!analyse.success) {
    return { ok: false, message: analyse.error.issues[0].message };
  }

  const session = await createClient();

  // `getUser()` et non `getSession()` : le premier fait vérifier le jeton par
  // le serveur d'authentification, le second se contente de lire le cookie.
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée. Reconnecte-toi." };

  const { data: liste } = await session
    .from("lists")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  const resultat = await ajouterAuLexique(createServiceClient(), {
    ...analyse.data,
    userId: user.id,
    listId: liste?.id ?? null,
  });

  if (!resultat.ok) return resultat;

  // La liste de courses change aussi : c'est là que la traduction s'affiche.
  revalidatePath("/");
  revalidatePath("/lexicon");

  return {
    ok: true,
    fr: resultat.terme.fr,
    fi: resultat.terme.fi,
    cree: resultat.cree,
    rattachees: resultat.rattachees,
    rattachementOk: resultat.rattachementOk,
  };
}
