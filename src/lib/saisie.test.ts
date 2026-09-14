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

    // Le vocabulaire des recettes. Les six premiers viennent d'une liste
    // réelle, remplie par le connecteur à partir d'une recette trouvée en
    // ligne : sans ces mots, le produit devenait « cuillères à soupe de
    // concentré de tomate », illisible en rayon et introuvable au lexique.
    [
      "2 cuillères à soupe de concentré de tomate",
      "2 cuillères à soupe",
      "concentré de tomate",
      "piège : le pluriel est au premier mot de la locution, pas au dernier",
    ],
    ["1 cuillère à soupe de persil plat", "1 cuillère à soupe", "persil plat", "la locution au singulier"],
    ["1/2 cuillère à café de sucre roux", "1/2 cuillère à café", "sucre roux", "fraction et locution ensemble"],
    ["1 pincée de sel", "1 pincée", "sel", "une mesure sans instrument"],
    ["2 cuillères à soupe d'huile d'olive", "2 cuillères à soupe", "huile d'olive", "locution, élision, et produit qui en contient une autre"],
    ["1 cuillère à soupe d'épices cajun", "1 cuillère à soupe", "épices cajun", "locution et élision"],
    ["200 grammes de farine", "200 grammes", "farine", "l'unité écrite en toutes lettres"],
    ["2 c. à s. de vinaigre", "2 c. à s.", "vinaigre", "piège : les points sont échappés, sinon ils matcheraient n'importe quoi"],
    ["3 brins de thym", "3 brins", "thym", "une mesure d'herbe fraîche"],
    ["1 morceau de gingembre", "1 morceau", "gingembre", "pluriel irrégulier au singulier"],
    ["2 morceaux de sucre", "2 morceaux", "sucre", "piège : le pluriel est en x"],
    ["1 verre de lait", "1 verre", "lait", "un contenant du quotidien"],
    ["2 cuillères à soupe", "", "2 cuillères à soupe", "une mesure sans produit reste la ligne entière"],
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
