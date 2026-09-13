import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installée.
 *
 * Sur Android, ce fichier ne produit pas un raccourci mais une **WebAPK** : un
 * paquet signé par Chrome, qui place l'application dans le tiroir
 * d'applications, dans le sélecteur de tâches et dans les paramètres système
 * avec sa propre entrée (décision D5). D'où l'exigence sur les champs : il en
 * manque un, et Chrome retombe sur un simple raccourci sans le dire.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kori — liste de courses",
    // Onze caractères : au-delà, Android tronque sous l'icône du tiroir.
    short_name: "Kori",
    description:
      "Liste de courses bilingue : saisie en français, affichage en finnois.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Une liste se tient d'une main. Le paysage n'apporterait que des lignes
    // plus larges et moins d'items visibles.
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["shopping", "food", "productivity"],
    icons: [
      { src: "/icones/kori-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/kori-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // L'icône masquable est dessinée plus petite dans la même plaque : Android
      // la recadre en cercle, en goutte ou en carré arrondi selon le lanceur, et
      // ce qui dépasse des 80 % centraux est perdu. Sans une icône dédiée,
      // Chrome ajoute lui-même un fond blanc autour de l'icône ordinaire, et
      // l'icône paraît rétrécie au milieu d'un disque.
      {
        src: "/icones/kori-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ajouter un produit",
        short_name: "Ajouter",
        description: "Ouvre la liste avec le champ de saisie prêt",
        url: "/?ajout=1",
        icons: [{ src: "/icones/kori-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
