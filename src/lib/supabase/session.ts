import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

/**
 * Rafraîchissement de la session, appelé par `src/proxy.ts` à chaque requête.
 *
 * Un jeton d'accès Supabase vit une heure. Sans ce passage, il expire pendant
 * que l'utilisateur regarde sa liste, et rien ne le renouvelle : un composant
 * serveur n'a pas le droit d'écrire un cookie pendant le rendu (voir le `catch`
 * de `server.ts`). C'est donc ici, avant que la page ne soit rendue, que le
 * jeton se renouvelle et que les cookies partent sur la réponse.
 *
 * Trois pièges, dans l'ordre où ils coûtent cher :
 *
 * 1. **La réponse est reconstruite à chaque écriture de cookie.** Les cookies
 *    posés doivent être visibles à la fois de la requête transmise en aval
 *    (pour que le rendu voie la session fraîche) et de la réponse renvoyée au
 *    navigateur. D'où le `NextResponse.next({ request })` refait dans `setAll`.
 *
 * 2. **Les en-têtes de cache ne sont pas décoratifs.** `@supabase/ssr` les passe
 *    en second argument de `setAll` depuis la 0.7. Une réponse qui pose un
 *    cookie de session et qui serait mise en cache par un CDN servirait le jeton
 *    d'un utilisateur à un autre. Vercel est un CDN.
 *
 * 3. **Une redirection perd les cookies** si on ne les recopie pas. Quand le
 *    rafraîchissement échoue, `@supabase/ssr` écrit des cookies d'effacement :
 *    les jeter laisserait le navigateur boucler sur une session morte.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [cle, valeur] of Object.entries(headers)) {
            response.headers.set(cle, valeur);
          }
        },
      },
    },
  );

  // Appel obligatoire, et tôt : c'est lui qui déclenche le rafraîchissement.
  // `getClaims()` vérifie la signature du jeton — contrairement à
  // `getSession()`, qui se contente de lire le cookie et fait donc confiance à
  // une valeur que le navigateur peut écrire.
  const { data } = await supabase.auth.getClaims();
  const connecte = Boolean(data?.claims);

  if (!connecte && routeProtegee(request.nextUrl.pathname)) {
    const redirection = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) {
      redirection.cookies.set(cookie);
    }
    return redirection;
  }

  if (connecte && request.nextUrl.pathname === "/login") {
    const redirection = NextResponse.redirect(new URL("/", request.url));
    for (const cookie of response.cookies.getAll()) {
      redirection.cookies.set(cookie);
    }
    return redirection;
  }

  return response;
}

/**
 * Tout est protégé sauf ce qui sert à se connecter. Une liste blanche, jamais
 * une liste noire : un écran ajouté demain est protégé par défaut, et l'oubli
 * se voit tout de suite au lieu de fuiter en silence.
 */
function routeProtegee(pathname: string): boolean {
  return !(pathname === "/login" || pathname.startsWith("/auth/"));
}
