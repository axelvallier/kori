/**
 * Cas de test de l'analyse de saisie.
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseEntry } from "./saisie.ts";
import { normalize } from "./terms.ts";

describe("parseEntry", () => {
  const cas: [string, string, string, string][] = [
    // saisie, quantité attendue, produit attendu, ce que le cas démontre
    ["500g de farine", "500 g", "farine", "le cas nommé par le ticket : unité collée au nombre"],
    ["500 g de farine", "500 g", "farine", "le même, unité détachée"],
    ["2 tomates", "2", "tomates", "un nombre seul, sans unité ni partitif"],
    ["1 paquet de pâtes", "1 paquet", "pâtes", "un contenant fait partie de la quantité"],
    ["farine", "", "farine", "sans quantité, le champ reste vide"],
    ["", "", "", "la chaîne vide ne lève pas"],
    ["  2   tomates  ", "2", "tomates", "espaces de bord et espaces multiples"],
    ["3 boîtes de thon", "3 boîtes", "thon", "contenant au pluriel"],
    ["1 kg de pommes de terre", "1 kg", "pommes de terre", "un produit qui contient lui-même « de »"],
    ["0,5 l de lait", "0,5 l", "lait", "décimale à la virgule, comme sur un clavier français"],
    ["1.5 kg de farine", "1.5 kg", "farine", "décimale au point"],
    ["1/2 citron", "1/2", "citron", "une fraction"],
    ["6 oeufs", "6", "oeufs", "le pluriel reste au produit, la normalisation s'en occupe après"],
    ["2 d'ail", "2", "ail", "élision après le nombre"],
    ["500 G de farine", "500 g", "farine", "l'unité est mise en minuscules"],
    ["2 Tomates", "2", "Tomates", "le produit garde sa casse : c'est lui que l'utilisateur relit"],
    ["500", "", "500", "un nombre seul n'est pas une quantité sans produit"],
    ["2 kg", "", "2 kg", "un nombre et une unité sans produit non plus"],
    ["crème fraîche", "", "crème fraîche", "un produit en deux mots, sans quantité"],
    ["1 bouteille de vin rouge", "1 bouteille", "vin rouge", "contenant et produit en deux mots"],
    ["10 tranches de jambon", "10 tranches", "jambon", "portion au pluriel"],
    ["4 gousses d'ail", "4 gousses", "ail", "contenant au pluriel et élision"],
  ];

  for (const [saisie, quantite, produit, pourquoi] of cas) {
    it(`« ${saisie} » → quantité « ${quantite} », produit « ${produit} » (${pourquoi})`, () => {
      assert.deepEqual(parseEntry(saisie), { quantite, produit });
    });
  }

  it("ne renvoie jamais null ni undefined pour la quantité", () => {
    for (const [saisie] of cas) {
      const { quantite } = parseEntry(saisie);
      assert.equal(typeof quantite, "string", `« ${saisie} » ne renvoie pas une chaîne`);
    }
  });

  it("donne « tomate » après normalisation, comme le demande le ticket", () => {
    const { quantite, produit } = parseEntry("2 tomates");
    assert.equal(quantite, "2");
    assert.equal(normalize(produit), "tomate");
  });

  it("laisse un produit trouvable par le lexique dans les formes du ticket", () => {
    assert.equal(normalize(parseEntry("500g de farine").produit), "farine");
    assert.equal(normalize(parseEntry("1 paquet de pâtes").produit), "pâte");
    assert.equal(normalize(parseEntry("6 oeufs").produit), "oeuf");
  });
});
