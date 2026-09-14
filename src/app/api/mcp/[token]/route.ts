import { createMcpHandler } from "mcp-handler";

import { resoudreJeton } from "./contexte";
import { enregistrerOutils } from "./outils";

/**
 * Le serveur MCP que Claude appelle (décision D3).
 *
 * C'est la seule surface de l'application accessible sans session Supabase :
 * elle s'authentifie par le jeton porté dans le chemin, et travaille ensuite
 * avec la clé secrète, qui contourne toutes les politiques RLS. Le filet de la
 * base ne joue donc pas ici — voir `.claude/rules/route-mcp.md`, et les deux
 * règles rappelées en tête de `outils.ts`.
 *
 * `api/` est hors du matcher de `src/proxy.ts` : sans cette exclusion, une
 * requête sans cookie de session serait redirigée vers `/login` et Claude
 * recevrait du HTML.
 */

/**
 * Jamais de cache, à aucun étage. Un jeton révoqué doit provoquer un refus au
 * prochain appel, pas au prochain vidage de cache : Vercel est un CDN, et une
 * réponse gardée survivrait à la révocation.
 */
export const dynamic = "force-dynamic";

const REFUS = JSON.stringify({ error: "unauthorized" });

/**
 * Jeton mal formé, inconnu, ou révoqué : **la même réponse**, le même corps, le
 * même code. Distinguer les cas confirmerait à qui essaie qu'un jeton a existé.
 * Rien non plus sur le compte, la date de révocation, ou ce qu'il aurait fallu
 * envoyer.
 */
function refuser(): Response {
  return new Response(REFUS, {
    status: 401,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function traiter(
  request: Request,
  ctx: RouteContext<"/api/mcp/[token]">,
): Promise<Response> {
  const { token } = await ctx.params;

  // Résolu avant toute chose : le serveur MCP lui-même n'est construit que si
  // le jeton est bon, donc aucun outil n'existe tant que le compte n'est pas
  // établi. Un handler construit d'abord et autorisé ensuite laisserait une
  // fenêtre où un outil tourne sans contexte.
  const contexte = await resoudreJeton(token);
  if (!contexte) return refuser();

  // Le handler est construit par requête, avec le contexte capturé dans la
  // portée des outils. C'est ce qui garantit qu'un outil ne peut pas recevoir
  // le compte d'un autre appel : il n'y a rien de partagé entre deux requêtes.
  const handler = createMcpHandler(
    (server) => enregistrerOutils(server, contexte),
    {
      serverInfo: { name: "kori", version: "1.0.0" },
      instructions:
        "Liste de courses bilingue français / finnois. L'utilisateur écrit en " +
        "français, la liste s'affiche en finnois. Les traductions viennent d'un " +
        "lexique vérifié, jamais d'une traduction automatique.",
    },
  );

  const reponse = await handler(request);

  // Les en-têtes de la réponse sont recopiés pour y ajouter `no-store`. Le
  // corps est transmis tel quel, y compris quand c'est un flux.
  const entetes = new Headers(reponse.headers);
  entetes.set("cache-control", "no-store");

  return new Response(reponse.body, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: entetes,
  });
}

export { traiter as GET, traiter as POST, traiter as DELETE };
