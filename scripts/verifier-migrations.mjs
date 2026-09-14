/**
 * Refuse les migrations qui peuvent detruire des donnees.
 *
 *   npm run migrations:verifier
 *
 * Pourquoi ce garde-fou et pas un autre : une migration qui contient une
 * *erreur* ne passe jamais a moitie. Postgres execute chaque fichier dans une
 * transaction, donc une faute de syntaxe ou une contrainte violee annule tout
 * le bloc et ne laisse aucune trace. Le danger n'est donc pas la migration
 * cassee — c'est la migration qui **fonctionne parfaitement et fait la mauvaise
 * chose** : supprimer une colonne, vider une table, ecraser des lignes. Aucune
 * verification automatique ne peut deviner l'intention. Ce script ne devine
 * rien : il refuse, et demande qu'on ecrive pourquoi.
 *
 * L'echappatoire est volontairement inconfortable. Pour faire passer une
 * migration destructrice, il faut ajouter dans le fichier :
 *
 *   -- kori:destructif <la raison, en clair>
 *
 * Ce n'est pas un contournement, c'est une signature : elle reste dans le
 * fichier pour toujours, et elle sera lue le jour ou quelqu'un cherchera
 * pourquoi ces donnees ont disparu.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

const MARQUEUR = /--\s*kori:destructif\s+(.{8,})/i;

/**
 * Ce qui detruit des donnees. `drop policy` et `drop trigger` n'y sont
 * volontairement pas : ce sont les formes idempotentes recommandees par
 * .claude/rules/migrations-sql.md, ecrites avant un `create` qui suit
 * immediatement. Les signaler noierait le vrai signal sous des faux positifs.
 */
const DESTRUCTEURS = [
  { nom: "suppression de table", motif: /\bdrop\s+table\b/ },
  { nom: "suppression de schema", motif: /\bdrop\s+schema\b/ },
  { nom: "suppression de base", motif: /\bdrop\s+database\b/ },
  { nom: "suppression de type", motif: /\bdrop\s+type\b/ },
  { nom: "suppression de colonne", motif: /\balter\s+table\b[\s\S]*\bdrop\s+column\b/ },
  { nom: "suppression de contrainte", motif: /\balter\s+table\b[\s\S]*\bdrop\s+constraint\b/ },
  { nom: "vidage de table", motif: /\btruncate\b/ },
  // Pas d'ancrage en debut d'instruction : dans un corps de fonction, le
  // `delete` est precede d'un `begin`, et l'ancrage le laissait passer. C'est
  // le test « corps de fonction » qui l'a montre.
  { nom: "suppression sans condition", motif: /\bdelete\s+from\b(?![\s\S]*\bwhere\b)/ },
  { nom: "mise a jour sans condition", motif: /\bupdate\s+[a-z_."]+\s+set\b(?![\s\S]*\bwhere\b)/ },
];

/**
 * Celui-la n'a pas d'echappatoire. La regle 3 du projet est sans exception :
 * une table nait avec ses politiques et ne les perd jamais. Un marqueur qui
 * autoriserait a la desactiver viderait la regle de son sens.
 */
const INTERDIT_ABSOLU = {
  nom: "desactivation de la securite au niveau des lignes",
  motif: /\bdisable\s+row\s+level\s+security\b/,
};

/** Retire les commentaires, sinon un exemple en commentaire declencherait l'alarme. */
function sansCommentaires(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Decoupe en instructions. Les corps de fonction entre dollars sont extraits
 * d'abord : ils contiennent des points-virgules qui ne terminent rien, et un
 * decoupage naif couperait au milieu. Ils sont analyses a part, parce qu'un
 * corps de fonction qui vide une table est tout aussi destructeur.
 */
function instructions(sql) {
  const corps = [];
  const reste = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (bloc) => {
    corps.push(bloc);
    return " ";
  });

  return [...reste.split(";"), ...corps.flatMap((c) => c.split(";"))]
    .map((i) => i.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((i) => i !== "");
}

/** Analyse un fichier. Renvoie la liste de ce qui a ete trouve. */
export function analyser(sql) {
  const propre = sansCommentaires(sql);
  const trouvailles = [];

  for (const instruction of instructions(propre)) {
    if (INTERDIT_ABSOLU.motif.test(instruction)) {
      trouvailles.push({ nom: INTERDIT_ABSOLU.nom, absolu: true, instruction });
    }
    for (const { nom, motif } of DESTRUCTEURS) {
      if (motif.test(instruction)) trouvailles.push({ nom, absolu: false, instruction });
    }
  }

  return { trouvailles, signe: MARQUEUR.exec(sql)?.[1]?.trim() ?? null };
}

function principal() {
  const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let refus = 0;

  for (const fichier of fichiers) {
    const { trouvailles, signe } = analyser(readFileSync(join(MIGRATIONS, fichier), "utf8"));
    if (trouvailles.length === 0) continue;

    const absolus = trouvailles.filter((t) => t.absolu);
    const autres = trouvailles.filter((t) => !t.absolu);

    for (const t of absolus) {
      console.error(`\n✖ ${fichier}\n  ${t.nom}\n  Interdit sans exception par la regle 3 du projet.` +
        `\n  Aucun marqueur ne l'autorise.\n  → ${t.instruction.slice(0, 110)}`);
      refus++;
    }

    if (autres.length === 0) continue;

    if (signe) {
      console.log(`\n⚠ ${fichier}\n  ${[...new Set(autres.map((t) => t.nom))].join(", ")}` +
        `\n  Assume par un marqueur : « ${signe} »`);
      continue;
    }

    console.error(`\n✖ ${fichier}`);
    for (const t of [...new Set(autres.map((t) => t.nom))]) console.error(`  ${t}`);
    console.error("  Ajoute dans le fichier, avec la raison :\n" +
      "    -- kori:destructif <pourquoi cette perte est voulue>");
    refus++;
  }

  if (refus > 0) {
    console.error(`\n${refus} migration(s) refusee(s) sur ${fichiers.length}.\n`);
    process.exit(1);
  }
  console.log(`${fichiers.length} migration(s) verifiee(s), rien de destructeur.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
