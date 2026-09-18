/**
 * Importe le lexique initial depuis data/terms.csv.
 *
 *   npm run seed:terms
 *
 * Idempotent : l'insertion est faite en `on conflict (fr_normalized) do
 * nothing`, donc une seconde exécution n'insère rien et ne modifie rien. C'est
 * délibéré — le lexique s'enrichit, il ne se réécrit pas, et la table `terms`
 * n'a d'ailleurs aucune politique d'update.
 *
 * Le script passe par la clé secrète, qui contourne les politiques RLS. C'est
 * nécessaire ici : les termes du seed n'ont pas d'auteur, alors que la
 * politique d'insertion exige `created_by = auth.uid()`. Il ne doit donc jamais
 * être appelé depuis le navigateur ni importé par du code client.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { normalize } from "../src/lib/terms.ts";

const RAYONS = new Set([
  "produce", "bakery", "meat", "fish", "dairy", "pantry",
  "frozen", "snacks", "drinks", "household", "hygiene", "other",
]);

type Terme = { fr: string; fi: string; aisle: string; fr_normalized: string };

function echec(message: string): never {
  console.error(`\nseed:terms — ${message}\n`);
  process.exit(1);
}

/** Analyse CSV minimale : ce fichier n'a ni guillemets ni virgules internes. */
function lireCsv(chemin: string): Terme[] {
  const lignes = readFileSync(chemin, "utf8").trim().split("\n");
  const entete = lignes.shift();
  if (entete?.trim() !== "fr,fi,aisle") {
    echec(`en-tête inattendu dans ${chemin} : « ${entete} »`);
  }

  return lignes.map((ligne, i) => {
    const champs = ligne.split(",");
    if (champs.length !== 3) {
      echec(`ligne ${i + 2} : ${champs.length} champs au lieu de 3 — ${ligne}`);
    }
    const [fr, fi, aisle] = champs.map((c) => c.trim());
    if (!fr || !fi || !aisle) echec(`ligne ${i + 2} : champ vide — ${ligne}`);
    if (!RAYONS.has(aisle)) echec(`ligne ${i + 2} : rayon inconnu « ${aisle} »`);
    return { fr, fi, aisle, fr_normalized: normalize(fr) };
  });
}

/**
 * Deux termes du fichier qui se normalisent pareil sont un bug de données : la
 * contrainte d'unicité n'en laisserait passer qu'un, silencieusement, et le
 * second disparaîtrait sans que personne le remarque.
 */
function refuserLesCollisions(termes: Terme[]): void {
  const vus = new Map<string, string>();
  const collisions: string[] = [];
  for (const t of termes) {
    const precedent = vus.get(t.fr_normalized);
    if (precedent) collisions.push(`« ${precedent} » et « ${t.fr} » → ${t.fr_normalized}`);
    else vus.set(t.fr_normalized, t.fr);
  }
  if (collisions.length > 0) {
    echec(`collisions de normalisation dans le CSV :\n  ${collisions.join("\n  ")}`);
  }
}

const ici = dirname(fileURLToPath(import.meta.url));
const termes = lireCsv(join(ici, "..", "data", "terms.csv"));
refuserLesCollisions(termes);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SECRET_KEY;
if (!url || !cle) {
  echec(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.\n" +
      "  Base locale : npm run seed:terms:local\n" +
      "  Base distante : renseigner .env.local, puis npm run seed:terms",
  );
}

// Annoncé en clair : ce script écrit, et on ne veut pas découvrir après coup
// qu'il a visé la production.
console.log(`seed:terms — cible ${new URL(url).host}, ${termes.length} termes lus`);

const supabase = createClient(url, cle, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("terms")
  // `fr_normalized` n'est pas envoyée : c'est une colonne générée depuis le
  // ticket 18, la base la calcule et refuserait qu'on la lui dicte. La forme
  // calculée ici ne sert qu'au contrôle des collisions au-dessus.
  .upsert(termes.map(({ fr, fi, aisle }) => ({ fr, fi, aisle })), {
    onConflict: "fr_normalized",
    ignoreDuplicates: true,
  })
  .select("fr_normalized");

if (error) echec(`insertion refusée : ${error.message} (${error.code ?? "sans code"})`);

const inseres = data?.length ?? 0;
console.log(`seed:terms — ${inseres} terme(s) inséré(s), ${termes.length - inseres} déjà présent(s)`);
