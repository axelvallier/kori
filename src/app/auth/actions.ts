"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Déconnexion. En action serveur et non en appel depuis le navigateur : c'est le
 * serveur qui détient les cookies de session, et c'est donc lui qui doit les
 * effacer. Un `signOut()` côté client laisserait les cookies httpOnly en place.
 */
export async function seDeconnecter() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
