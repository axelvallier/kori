/**
 * Cas de test de ce que l'écran de lexique et le connecteur partagent.
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CODES_RAYONS, regrouperManquants, texteDeLexique } from "./lexique.ts";
import { RAYONS } from "./rayons.ts";

describe("regrouperManquants", () => {
  it("fait converger deux graphies d'un même terme en une seule demande", () => {
    const manquants = regrouperManquants([{ raw_fr: "oeufs" }, { raw_fr: "des œufs" }]);
    assert.equal(manquants.length, 1);
    assert.equal(manquants[0].forme, "oeuf");
    assert.equal(manquants[0].lignes, 2);
  });

  it("garde le français de la première ligne rencontrée, c'est celui qu'on relit", () => {
    const [m] = regrouperManquants([{ raw_fr: "Tomates" }, { raw_fr: "tomate" }]);
    assert.equal(m.fr, "Tomates");
  });

  it("conserve l'ordre de la liste", () => {
    const manquants = regrouperManquants([{ raw_fr: "b" }, { raw_fr: "a" }, { raw_fr: "b" }]);
    assert.deepEqual(manquants.map((m) => m.fr), ["b", "a"]);
  });

  it("ignore une ligne dont la forme est vide, rien ne pourrait s'y rattacher", () => {
    assert.deepEqual(regrouperManquants([{ raw_fr: "   " }, { raw_fr: "d'" }]), []);
  });
});

describe("texteDeLexique", () => {
  const schema = texteDeLexique("Le finnois");

  it("retire les espaces de bord", () => {
    assert.equal(schema.parse("  maito "), "maito");
  });

  it("refuse le vide, le trop long et le multiligne", () => {
    assert.equal(schema.safeParse("   ").success, false);
    assert.equal(schema.safeParse("a".repeat(81)).success, false);
    assert.equal(schema.safeParse("maito\nkerma").success, false);
    assert.equal(schema.safeParse("maito​kerma").success, false);
  });

  it("laisse passer les diacritiques du finnois", () => {
    assert.equal(schema.parse("pähkinä"), "pähkinä");
  });
});

describe("CODES_RAYONS", () => {
  it("suit RAYONS, dans le même ordre", () => {
    assert.deepEqual([...CODES_RAYONS], RAYONS.map((r) => r.code));
  });
});
