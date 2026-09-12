import type { NextConfig } from "next";

/**
 * En-tetes de securite appliques a toutes les reponses.
 *
 * La politique de securite du contenu (CSP) est volontairement absente pour
 * l'instant : elle sera ecrite quand il y aura des pages reelles et des
 * origines connues. Une CSP posee trop tot finit en liste d'exceptions, ce qui
 * est pire que pas de CSP du tout parce que ca donne l'illusion de la
 * protection.
 */
const securityHeaders = [
  // Aucune mise en cadre, quelle que soit l'origine : rien ici ne s'embarque.
  { key: "X-Frame-Options", value: "DENY" },
  // Interdit au navigateur de deviner un type MIME different de celui annonce.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // L'origine seule part vers les autres sites, jamais le chemin complet.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Aucune de ces trois capacites n'est utilisee par l'application.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/**
 * HSTS uniquement en production : en developpement le site est servi en http
 * sur localhost, et un HSTS pose la rendrait injoignable apres coup.
 *
 * `preload` n'est volontairement pas inclus. Il suppose une inscription sur la
 * liste des navigateurs, qui se retire en plusieurs mois : c'est une decision a
 * prendre quand le nom de domaine est definitif, pas au premier jour.
 */
const productionHeaders =
  process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : [];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, ...productionHeaders],
      },
    ];
  },
};

export default nextConfig;
