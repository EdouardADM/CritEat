/* Configuration globale des tests. */

// Mock officiel d'AsyncStorage (utilisé par le fallback web de l'adaptateur de stockage).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
