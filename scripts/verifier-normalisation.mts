/**
 * Compare `normalize()` (TypeScript) à `normalize_fr()` (SQL) sur les mêmes
 * entrées, et refuse la moindre différence.
 *
 *   npm run db:test:normalisation
 *
 * Pourquoi ce script existe : depuis le ticket 18, `terms.fr_normalized` est
 * calculée par Postgres, mais c'est le TypeScript qui produit la forme cherchée
 * à la lecture (`resolveTermes`) et celle relue après un conflit
 * (`add_translation`). Si les deux règles divergent d'un caractère, une
 * traduction présente devient introuvable, sans erreur nulle part. Les tests
 * unitaires ne peuvent pas le voir : ils ne parlent qu'à un côté.
 *
 * Les entrées comparées : tous les cas de `src/lib/terms.cas.ts`, plus tout
 * le lexique de `data/terms.csv` — le second parce que c'est là que vivent les
 * mots réels, avec leurs accents et leurs pluriels irréguliers.
 *
 * Il parle à la base locale par `docker exec`, comme `npm run db:test` : pas
 * de variable d'environnement, pas de clé. Ce n'est donc pas un test de
 * l'intégration continue, qui n'a pas de base ; il se lance avant d'ouvrir une
 * pull request qui touche à la normalisation, d'un côté ou de l'autre.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAS } from "../src/lib/terms.cas.ts";
import { normalize } from "../src/lib/terms.ts";

const ici = dirname(fileURLToPath(import.meta.url));

const lexique = readFileSync(join(ici, "..", "data", "terms.csv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((ligne) => ligne.split(",")[0].trim());

const entrees = [...new Set([...CAS.map(([saisie]) => saisie), ...lexique])];

// Une seule requête, les entrées passées en JSON dans une chaîne à dollars :
// aucun échappement SQL à écrire, et la sortie revient en JSON aussi, donc une
// entrée qui contient une tabulation ou un saut de ligne ne casse rien.
const json = JSON.stringify(entrees);
if (json.includes("$json$")) throw new Error("une entrée contient le délimiteur $json$");

const sql = `
  select coalesce(jsonb_agg(jsonb_build_object('fr', fr, 'sql', public.normalize_fr(fr))), '[]')
    from jsonb_array_elements_text($json$${json}$json$::jsonb) as t(fr);
`;

const sortie = execFileSync(
  "docker",
  ["exec", "-i", "supabase_db_kori", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
  { input: sql, encoding: "utf8" },
);

const reponses = JSON.parse(sortie.trim()) as { fr: string; sql: string }[];
if (reponses.length !== entrees.length) {
  throw new Error(`${entrees.length} entrées envoyées, ${reponses.length} réponses reçues`);
}

const ecarts = reponses
  .map(({ fr, sql }) => ({ fr, sql, ts: normalize(fr) }))
  .filter(({ sql, ts }) => sql !== ts);

if (ecarts.length > 0) {
  console.error(`\n${ecarts.length} écart(s) entre normalize() et normalize_fr() :\n`);
  for (const { fr, ts, sql } of ecarts) {
    console.error(`  ${JSON.stringify(fr)}\n    TypeScript : ${JSON.stringify(ts)}\n    SQL        : ${JSON.stringify(sql)}`);
  }
  console.error("");
  process.exit(1);
}

console.log(`${entrees.length} entrées, aucune différence entre normalize() et normalize_fr().`);
