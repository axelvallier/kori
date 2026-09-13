import { createClient } from "@/lib/supabase/server";

type Etat =
  | { statut: "ok"; termes: number }
  | { statut: "table-absente" }
  | { statut: "erreur"; code: string };

/**
 * Interroge le lexique. Tant que le ticket 03 n'a pas créé les tables, la
 * réponse est une erreur `PGRST205`, « table introuvable » — et c'est une
 * réponse utile : elle prouve que l'URL répond et que la clé publiable est
 * acceptée. Une clé invalide donnerait un 401, une URL fausse une erreur
 * réseau. Le même code servira tel quel une fois la table créée.
 */
async function sonderLexique(): Promise<Etat> {
  const supabase = await createClient();

  // Surtout pas `head: true`. Une requête HEAD vers une table absente renvoie
  // un 404 au corps vide, et postgrest-js convertit ce cas précis en 204 sans
  // erreur (rustine de son issue 295). La sonde afficherait alors « 0 terme »
  // pour une table qui n'existe pas. Le GET renvoie un corps JSON lisible.
  const { count, error } = await supabase
    .from("terms")
    .select("id", { count: "exact" })
    .limit(1);

  if (!error) return { statut: "ok", termes: count ?? 0 };
  if (error.code === "PGRST205") return { statut: "table-absente" };
  return { statut: "erreur", code: error.code ?? "inconnu" };
}

export default async function Home() {
  const etat = await sonderLexique();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Kori</h1>
      <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
        Liste de courses bilingue français / finnois.
      </p>

      {/* Écran de contrôle temporaire : le ticket 08 le remplace par la liste. */}
      <div className="mt-4 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/15">
        {etat.statut === "ok" && (
          <p>
            Supabase répond. Lexique : <strong>{etat.termes}</strong>{" "}
            {etat.termes === 1 ? "terme" : "termes"}.
          </p>
        )}
        {etat.statut === "table-absente" && (
          <p>
            Supabase répond, la clé est acceptée. La table{" "}
            <code className="font-mono">terms</code> reste à créer (ticket 03).
          </p>
        )}
        {etat.statut === "erreur" && (
          // Le code seul, jamais le message : cette page est publique et un
          // message d'erreur PostgREST décrit volontiers le schéma.
          <p>
            Supabase a refusé la requête. Code{" "}
            <code className="font-mono">{etat.code}</code>.
          </p>
        )}
      </div>
    </main>
  );
}
