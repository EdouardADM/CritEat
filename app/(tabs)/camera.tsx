import { View } from "react-native";

// Écran fantôme — jamais affiché.
// Le tab "Caméra" intercepte tabPress et redirige vers /review/select
// avant que cette route ne soit rendue (voir _layout.tsx listeners).
export default function CameraTab() {
  return <View />;
}
