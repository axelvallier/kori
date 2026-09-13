import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kori",
  description: "Liste de courses bilingue français / finnois.",
  // Une liste de courses n'a rien à faire dans un index de recherche, et son
  // écran n'existe que derrière une session de toute façon.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Kori", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // La couleur de la barre système suit le réglage du téléphone. Une seule
  // valeur laisserait une bande blanche au-dessus d'une application sombre.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // Volontairement pas de `maximumScale` ni de `userScalable: false` : bloquer
  // le zoom rendrait l'application inutilisable à qui en a besoin, et ne
  // gagnerait rien — aucune mise en page ici ne casse quand on zoome.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
