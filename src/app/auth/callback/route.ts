import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

/**
 * Retour du lien magique.
 *
 * Le flux est PKCE : `@supabase/ssr` le choisit pour ses deux clients. Au moment
 * où le lien est demandé, le client serveur dépose un vérificateur dans un
 * cookie ; le lien reçu par email ramène ici avec un `code`, et l'échange ne
 * réussit que si les deux se répondent. Un lien intercepté ne suffit donc pas :
 * il faut aussi le navigateur qui l'a demandé. C'est la raison pour laquelle le
 * lien ouvert sur un autre appareil échoue — ce n'est pas un bug.
 *
 * Cette route est la seule à échanger un code contre une session, et sa réponse
 * pose les cookies de session : elle doit porter les en-têtes de non-mise en
 * cache fournis par la bibliothèque. Une redirection mise en cache par un CDN
 * rejouerait la session d'un utilisateur pour le suivant.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?erreur=lien", request.url));
  }

  const aPoser: { name: string; value: string; options: object }[] = [];
  const enTetes: Record<string, string> = {};

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          aPoser.push(...cookiesToSet);
          Object.assign(enTetes, headers);
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Lien déjà utilisé, expiré, ou ouvert dans un autre navigateur que celui
    // qui l'a demandé. Les trois se traitent pareil : revenir au formulaire.
    console.error("exchangeCodeForSession", error.status, error.code, error.message);
    return NextResponse.redirect(new URL("/login?erreur=lien", request.url));
  }

  const reponse = NextResponse.redirect(new URL("/", request.url));

  for (const { name, value, options } of aPoser) {
    reponse.cookies.set(name, value, options);
  }
  for (const [cle, valeur] of Object.entries(enTetes)) {
    reponse.headers.set(cle, valeur);
  }

  return reponse;
}
