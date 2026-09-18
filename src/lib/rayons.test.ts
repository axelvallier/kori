/**
 * Cas de test du regroupement par rayon (ticket 17).
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Ligne } from "./liste.ts";
import { RAYONS, grouperParRayon, rayonDe } from "./rayons.ts";

let compteur = 0;

/** Une ligne de liste minimale. `aisle` absent = traduction manquante. */
function ligne(raw_fr: string, aisle?: string, checked = false): Ligne {
  compteur += 1;
  return {
    id: `l${compteur}`,
    raw_fr,
    quantity: null,
    checked,
    created_at: "2026-09-18T00:00:00Z",
    terme: aisle ? { fr: raw_fr, fi: `${raw_fr}-fi`, aisle } : null,
  };
}

const noms = (lignes: Ligne[]) => lignes.map((l) => l.raw_fr);

describe("RAYONS", () => {
  it("suit l'ordre du ticket, et finit par « autre »", () => {
    assert.deepEqual(
      RAYONS.map((r) => r.code),
      ["produce", "bakery", "dairy", "meat", "fish", "pantry", "frozen", "snacks", "drinks", "household", "hygiene", "other"],
    );
  });

  it("couvre chaque valeur de l'énuméré `aisle` de la base, une seule fois", () => {
    // La liste des valeurs de l'énuméré, telle que le connecteur l'expose.
    const enumere = ["produce", "bakery", "meat", "fish", "dairy", "pantry", "frozen", "snacks", "drinks", "household", "hygiene", "other"];
    assert.deepEqual([...RAYONS.map((r) => r.code)].sort(), [...enumere].sort());
  });

  it("a un finnois et un français pour chaque rayon", () => {
    for (const r of RAYONS) {
      assert.ok(r.fi.length > 0 && r.fr.length > 0, r.code);
    }
  });
});

describe("rayonDe", () => {
  it("rend le rayon du terme", () => {
    assert.equal(rayonDe(ligne("lait", "dairy")).code, "dairy");
  });

  it("rend « autre » sans terme : on ne sait pas où est l'article", () => {
    assert.equal(rayonDe(ligne("truc")).code, "other");
  });

  it("rend « autre » sur un rayon que l'écran ne connaît pas, plutôt que de lever", () => {
    assert.equal(rayonDe(ligne("truc", "zzz-inconnu")).code, "other");
  });
});

describe("grouperParRayon", () => {
  it("range dans l'ordre du magasin, quel que soit l'ordre d'ajout", () => {
    const { sections } = grouperParRayon([
      ligne("lessive", "household"),
      ligne("lait", "dairy"),
      ligne("tomates", "produce"),
      ligne("saumon", "fish"),
    ]);
    assert.deepEqual(
      sections.map((s) => s.rayon.code),
      ["produce", "dairy", "fish", "household"],
    );
  });

  it("n'affiche pas d'en-tête pour un rayon sans article", () => {
    const { sections } = grouperParRayon([ligne("pain", "bakery")]);
    assert.deepEqual(sections.map((s) => s.rayon.code), ["bakery"]);
  });

  it("garde l'ordre d'ajout à l'intérieur d'un rayon", () => {
    const { sections } = grouperParRayon([
      ligne("poireaux", "produce"),
      ligne("lait", "dairy"),
      ligne("carottes", "produce"),
      ligne("ail", "produce"),
    ]);
    assert.deepEqual(noms(sections[0].lignes), ["poireaux", "carottes", "ail"]);
  });

  it("met les traductions manquantes dans « autre », en fin de liste", () => {
    const { sections } = grouperParRayon([
      ligne("chose inconnue"),
      ligne("eau", "drinks"),
    ]);
    assert.deepEqual(sections.map((s) => s.rayon.code), ["drinks", "other"]);
    assert.deepEqual(noms(sections[1].lignes), ["chose inconnue"]);
  });

  it("sort les cochées de leur rayon et les rend à part, dans leur ordre", () => {
    const { sections, cochees } = grouperParRayon([
      ligne("tomates", "produce", true),
      ligne("lait", "dairy"),
      ligne("pain", "bakery", true),
      ligne("oignons", "produce"),
    ]);
    assert.deepEqual(sections.map((s) => s.rayon.code), ["produce", "dairy"]);
    assert.deepEqual(noms(sections[0].lignes), ["oignons"]);
    assert.deepEqual(noms(cochees), ["tomates", "pain"]);
  });

  it("un caddie de quinze articles se parcourt sans revenir sur ses pas", () => {
    // Quinze articles dans le désordre d'une recette, chacun avec son rayon.
    const codes = ["pantry", "produce", "dairy", "meat", "produce", "drinks", "bakery", "frozen", "produce", "hygiene", "dairy", "pantry", "household", "fish", "snacks"];
    const { sections } = grouperParRayon(codes.map((c, i) => ligne(`article ${i}`, c)));

    // L'ordre des sections est croissant dans RAYONS : aucun retour en arrière.
    const rangs = sections.map((s) => RAYONS.findIndex((r) => r.code === s.rayon.code));
    for (let i = 1; i < rangs.length; i += 1) assert.ok(rangs[i] > rangs[i - 1]);

    // Et rien n'a été perdu en route.
    assert.equal(sections.reduce((n, s) => n + s.lignes.length, 0), 15);
  });

  it("rend une liste vide sans lever", () => {
    assert.deepEqual(grouperParRayon([]), { sections: [], cochees: [] });
  });
});
