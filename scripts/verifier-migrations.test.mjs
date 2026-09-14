/**
 * Cas de test du controleur de migrations.
 *
 *   npm test
 *
 * Un controleur qui ne dit jamais rien ne protege de rien : chaque motif a donc
 * son cas qui doit etre attrape, et chaque forme legitime son cas qui doit
 * passer. Les seconds comptent autant que les premiers — un garde-fou qui cric
 * sur du code correct finit par etre desactive.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyser } from "./verifier-migrations.mjs";

const noms = (sql) => analyser(sql).trouvailles.map((t) => t.nom);

describe("ce qui doit etre attrape", () => {
  const cas = [
    ["drop table public.lists;", "suppression de table"],
    ["drop schema public cascade;", "suppression de schema"],
    ["drop type public.aisle;", "suppression de type"],
    ["alter table public.lists drop column name;", "suppression de colonne"],
    ["alter table public.lists drop constraint lists_owner_id_fkey;", "suppression de contrainte"],
    ["truncate public.list_items;", "vidage de table"],
    ["delete from public.list_items;", "suppression sans condition"],
    ["update public.terms set fi = 'x';", "mise a jour sans condition"],
  ];

  for (const [sql, attendu] of cas) {
    it(`${attendu} : ${sql.slice(0, 48)}`, () => {
      assert.ok(noms(sql).includes(attendu), `non detecte : ${sql}`);
    });
  }

  it("voit aussi le danger dans un corps de fonction, ou les points-virgules ne terminent rien", () => {
    const sql = `create function f() returns trigger language plpgsql as $$
      begin
        delete from public.list_items;
        return new;
      end;
    $$;`;
    assert.ok(noms(sql).includes("suppression sans condition"));
  });
});

describe("ce qui doit passer", () => {
  const cas = [
    ["drop policy if exists p on public.lists;", "forme idempotente recommandee par les regles du projet"],
    ["drop trigger if exists t on auth.users;", "idem, avant un create qui suit"],
    ["delete from public.list_items where checked = true;", "suppression avec condition"],
    ["update public.terms set fr_normalized = 'x' where fr like '%oe%';", "mise a jour avec condition"],
    ["create table public.t (id uuid primary key);", "creation"],
    ["alter table public.t enable row level security;", "activation de RLS"],
    ["-- drop table public.lists;", "un exemple en commentaire n'est pas une instruction"],
    ["/* truncate public.terms; */ select 1;", "commentaire de bloc"],
  ];

  for (const [sql, pourquoi] of cas) {
    it(`${pourquoi}`, () => {
      assert.deepEqual(noms(sql), [], `faux positif sur : ${sql}`);
    });
  }
});

describe("le marqueur", () => {
  it("assume une suppression, en gardant la raison dans le fichier", () => {
    const sql = "-- kori:destructif colonne jamais remplie depuis le ticket 12\nalter table public.t drop column vide;";
    const { trouvailles, signe } = analyser(sql);
    assert.equal(trouvailles.length, 1);
    assert.equal(signe, "colonne jamais remplie depuis le ticket 12");
  });

  it("exige une raison un peu etoffee, pas un mot", () => {
    assert.equal(analyser("-- kori:destructif ok\ndrop table t;").signe, null);
  });

  it("n'autorise jamais la desactivation de RLS", () => {
    const sql = "-- kori:destructif on assume completement ce choix\nalter table public.t disable row level security;";
    const { trouvailles } = analyser(sql);
    const absolu = trouvailles.find((t) => t.absolu);
    assert.ok(absolu, "la desactivation de RLS doit rester detectee");
    assert.equal(absolu.nom, "desactivation de la securite au niveau des lignes");
  });
});
