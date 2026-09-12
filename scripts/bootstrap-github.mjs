#!/usr/bin/env node
// Crée les labels, les milestones et les issues du backlog sur GitHub.
// Prérequis : gh installé et authentifié (gh auth login).
// Usage : node scripts/bootstrap-github.mjs <owner/repo>
// Idempotent : une issue portant déjà le même titre n'est pas recréée.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2];
if (!repo || !repo.includes('/')) {
  console.error('Usage : node scripts/bootstrap-github.mjs <owner/repo>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const ticketsDir = join(here, '..', 'docs', 'tickets');

const gh = (args, allowFail = false) => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' });
  } catch (err) {
    if (allowFail) return null;
    console.error(err.stderr || err.message);
    process.exit(1);
  }
};

const LABELS = [
  ['type:feat', '0E8A16', 'Nouvelle fonctionnalité'],
  ['type:chore', 'C5DEF5', 'Outillage, configuration, dette'],
  ['type:doc', 'D4C5F9', 'Documentation'],
  ['size:S', 'FEF2C0', 'Moins de deux heures'],
  ['size:M', 'FBCA04', 'Une demi-journée'],
  ['size:L', 'D93F0B', 'Une journée ou plus'],
  ['area:front', '1D76DB', 'Interface'],
  ['area:db', '5319E7', 'Base de données'],
  ['area:auth', 'B60205', 'Authentification'],
  ['area:mcp', '006B75', 'Connecteur Claude'],
];

const MILESTONES = [
  ['M0 Socle', 'Squelette déployé et base en place'],
  ['M1 Liste utilisable', 'Faire ses courses avec, sans Claude'],
  ['M2 Connecteur Claude', 'La recette qui remplit la liste'],
  ['M3 Lexique et rayons', 'Autonomie du lexique et parcours du magasin'],
  ['M4 Finition mobile', 'Installable, lisible, utilisable hors ligne'],
];

console.log('Labels');
for (const [name, color, description] of LABELS) {
  gh(['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force']);
  console.log('  ' + name);
}

console.log('Milestones');
const existing = JSON.parse(
  gh(['api', `repos/${repo}/milestones?state=all&per_page=100`]) || '[]'
);
for (const [title, description] of MILESTONES) {
  if (existing.some((m) => m.title === title)) {
    console.log('  ' + title + ' (déjà présent)');
    continue;
  }
  gh(['api', `repos/${repo}/milestones`, '-f', `title=${title}`, '-f', `description=${description}`]);
  console.log('  ' + title);
}

const parse = (raw) => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('front-matter manquant');
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: match[2].trim() };
};

const openIssues = JSON.parse(
  gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '200', '--json', 'title']) || '[]'
);
const known = new Set(openIssues.map((i) => i.title));

console.log('Issues');
for (const file of readdirSync(ticketsDir).filter((f) => f.endsWith('.md')).sort()) {
  const { meta, body } = parse(readFileSync(join(ticketsDir, file), 'utf8'));
  if (known.has(meta.title)) {
    console.log('  ' + meta.title + ' (déjà présente)');
    continue;
  }
  const args = ['issue', 'create', '--repo', repo, '--title', meta.title, '--body', body];
  if (meta.milestone) args.push('--milestone', meta.milestone);
  for (const label of (meta.labels || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    args.push('--label', label);
  }
  const url = gh(args);
  console.log('  ' + meta.title + '  ' + (url || '').trim());
}

console.log('\nTerminé.');
