"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Client Supabase pour le navigateur.
 *
 * La directive `use client` n'est pas décorative : elle fait échouer le build
 * si un composant serveur importe ce module, au lieu de laisser l'erreur
 * apparaître à l'exécution sur un `document` absent.
 *
 * Seules les variables publiques sont lues ici. La clé publiable est conçue
 * pour être exposée : ce qu'elle autorise est borné par les politiques de
 * sécurité au niveau des lignes, et par rien d'autre. D'où la règle : toute
 * table lue depuis le navigateur doit avoir ses politiques.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
