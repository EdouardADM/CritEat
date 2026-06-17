/** @type {import('expo/config').ExpoConfig} */
const config = {
  expo: {
    name: "CritEat",
    slug: "CritEat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "criteat",
    userInterfaceStyle: "automatic",
    // New Architecture désactivée : @maplibre/maplibre-react-native v10.x utilise
    // ReactNativeHost directement dans MLRNLocationModule, incompatible avec la
    // New Arch. À réactiver quand MapLibre supportera pleinement Fabric/TurboModules.
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.criteat.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Criteat utilise votre position pour vous montrer les restaurants à proximité et vérifier votre présence lors de la publication d'un avis.",
      },
    },
    android: {
      package: "com.criteat.app",
      // Icône adaptative basée sur la vraie icône CritEat (pleine/opaque → pas de
      // raccord de couleur). Les anciens fichiers android-icon-* étaient les
      // valeurs par défaut du template Expo (chevron bleu) → d'où l'icône Expo.
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#E8472A",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-sharing",
      "@maplibre/maplibre-react-native",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "expo-font",
      "expo-image",
      "expo-web-browser",
      [
        "expo-image-picker",
        {
          cameraPermission:
            "Criteat a besoin de la caméra pour photographier votre plat.",
          photosPermission:
            "Criteat a besoin d'accéder à vos photos.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Criteat utilise votre position pour vous montrer les restaurants à proximité et vérifier votre présence lors de la publication d'un avis.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      // Désactivé : React Compiler (expérimental) modifie le timing de rendu des
      // TextInput contrôlés et fait perdre les emoji à la saisie sur iOS.
      reactCompiler: false,
    },
    extra: {
      eas: {
        projectId: "f5dcdcf1-e1f9-4727-b500-9e17238cf98f",
      },
    },
  },
};

module.exports = config;
