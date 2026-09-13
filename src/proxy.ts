import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/session";

/**
 * Next 16 a renommé `middleware.ts` en `proxy.ts` ; la fonction exportée s'appelle
 * `proxy`. L'ancien nom fonctionne encore mais est déprécié, et il tourne
 * désormais sur le runtime Node par défaut.
 *
 * Ce fichier ne contient aucune logique : la session est l'affaire de
 * `lib/supabase/session.ts`. Next n'accepte qu'un seul fichier proxy par projet,
 * autant qu'il reste un aiguillage lisible.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tout, sauf :
     * - `_next/static` et `_next/image`, servis par Next lui-même
     * - les fichiers statiques reconnaissables à leur extension
     * - `api/`, dont la seule route prévue est le connecteur MCP : il
     *   s'authentifie par un jeton d'URL (décision D3) et non par une session,
     *   donc le rediriger vers /login le casserait.
     *
     * Sans exclusion, le proxy tournerait aussi sur les feuilles de style et les
     * images, et la redirection vers /login les rendrait introuvables.
     */
    "/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
