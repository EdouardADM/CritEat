// ── Constantes légales & RGPD ───────────────────────────────────────────────
//
// ⚠️ À COMPLÉTER par le responsable du traitement : remplace les valeurs
// placeholder ci-dessous (nom et email de contact dédiée).

export const RESPONSABLE_NAME = "Édouard Adam"; // TODO: confirmer le nom officiel
export const CONTACT_EMAIL = "criteatsupport@gmail.com"; // TODO: boîte dédiée réelle

// Version de la politique. Incrémenter à chaque modification substantielle :
// les utilisateurs devront alors ré-accepter (le gate de consentement compare cette valeur).
export const CONSENT_VERSION = "1.0";

// Autorité de contrôle compétente (Belgique).
export const APD = {
  name: "Autorité de protection des données (APD)",
  url: "https://www.autoriteprotectiondonnees.be",
};

// ── Contenu de la politique de confidentialité ───────────────────────────────

export type PolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const PRIVACY_LAST_UPDATED = "30 mai 2026";

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    title: "1. Responsable du traitement",
    paragraphs: [
      `Le responsable du traitement des données est ${RESPONSABLE_NAME}, dans le cadre du projet CritEat.`,
      `Pour toute question relative à tes données ou pour exercer tes droits, tu peux nous contacter à l'adresse ${CONTACT_EMAIL}, ou directement depuis l'écran « Nous contacter » de l'application.`,
    ],
  },
  {
    title: "2. Données collectées",
    paragraphs: ["Nous traitons trois catégories de données :"],
    bullets: [
      "Données que tu fournis : adresse email, mot de passe (stocké haché, jamais en clair), nom d'utilisateur, photo de profil (avatar), biographie, préférences alimentaires.",
      "Données générées par ton usage : avis et photos publiés, votes, relations de suivi, score de Karma.",
      "Données techniques : identifiant utilisateur unique, jetons de session (JWT) stockés de façon chiffrée sur ton appareil.",
    ],
  },
  {
    title: "3. Finalités et base légale",
    paragraphs: [
      "Tes données sont traitées pour te permettre de créer un compte, publier et consulter des avis, interagir avec la communauté et personnaliser ton expérience.",
      "La base légale est ton consentement (article 6.1.a du RGPD), recueilli explicitement lors de l'inscription et de la connexion, ainsi que l'exécution du service que tu demandes (article 6.1.b).",
    ],
  },
  {
    title: "4. Sous-traitants",
    paragraphs: [
      "Pour fonctionner, l'application s'appuie sur des prestataires techniques qui peuvent traiter certaines données pour notre compte :",
    ],
    bullets: [
      "Supabase — hébergement de la base de données, authentification et stockage des fichiers.",
      "Expo — distribution de l'application et services associés.",
      "Apple — distribution via l'App Store / TestFlight.",
      "OpenFreeMap — fonds cartographiques.",
    ],
  },
  {
    title: "5. Sécurité",
    paragraphs: [
      "Les mots de passe sont hachés, les communications chiffrées (HTTPS), et la session est conservée dans le coffre sécurisé de ton appareil (Keychain iOS / Keystore Android).",
      "L'accès aux données est restreint par des règles de sécurité au niveau de chaque ligne (Row Level Security).",
    ],
  },
  {
    title: "6. Tes droits",
    paragraphs: [
      "Tu peux exercer à tout moment tes droits depuis l'écran « Mes données » de l'application :",
    ],
    bullets: [
      "Accès et portabilité (Art. 15 & 20) : exporter une copie de tes données au format JSON.",
      "Rectification (Art. 16) : corriger tes informations personnelles.",
      "Opposition et retrait du consentement (Art. 21 & 7.3) : revenir sur ton acceptation à tout moment.",
      "Effacement (Art. 17) : supprimer définitivement ton compte et tes données.",
      "Limitation du traitement et autres droits : via le moyen de contact ci-dessus.",
    ],
  },
  {
    title: "7. Conservation",
    paragraphs: [
      "Tes données sont conservées tant que ton compte est actif. En cas de suppression, elles sont effacées de façon permanente dans un délai maximal de 30 jours.",
    ],
  },
  {
    title: "8. Contact et réclamation",
    paragraphs: [
      `Nous répondons à toute demande dans un délai d'un mois (article 12.3 du RGPD). Contact : ${CONTACT_EMAIL}.`,
      `Si tu estimes que tes droits ne sont pas respectés, tu peux introduire une réclamation auprès de l'${APD.name} (${APD.url}).`,
    ],
  },
];
