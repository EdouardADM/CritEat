// Requires: npx expo install expo-image-picker
// app.json → plugins: [["expo-image-picker", {
//   "cameraPermission": "Criteat a besoin de la caméra pour photographier votre plat.",
//   "photosPermission": "Criteat a besoin d'accéder à vos photos."
// }]]

import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  photoUri: string | null;
  onPhoto: (uri: string) => void;
  onRetake: () => void;
};

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.85,
  allowsEditing: true,
  aspect: [4, 3],
};

export default function StepPhoto({ photoUri, onPhoto, onRetake }: Props) {
  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission refusée",
        "L'accès à la caméra est requis. Activez-le dans les réglages."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (!result.canceled) {
      onPhoto(result.assets[0].uri);
    }
  };

  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission refusée",
        "L'accès à la galerie est requis. Activez-le dans les réglages."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (!result.canceled) {
      onPhoto(result.assets[0].uri);
    }
  };

  if (photoUri) {
    return (
      <View style={styles.previewContainer}>
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
        <Pressable style={styles.retakeBtn} onPress={onRetake}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retakeText}>Recommencer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Ionicons name="camera-outline" size={56} color="#DDD" />
        <Text style={styles.placeholderText}>
          Ajoutez une photo de votre plat
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable style={styles.btnPrimary} onPress={handleCamera}>
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.btnPrimaryText}>Prendre une photo</Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={handleGallery}>
          <Ionicons name="images-outline" size={22} color="#E8472A" />
          <Text style={styles.btnSecondaryText}>Depuis la galerie</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 16,
  },

  // ── Placeholder ─────────────────────────────────────────────────────────────
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#F8F8F8",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#EEE",
    borderStyle: "dashed",
  },
  placeholderText: {
    fontSize: 15,
    color: "#AAA",
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // ── Boutons ──────────────────────────────────────────────────────────────────
  buttons: {
    gap: 12,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#E8472A",
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: "#E8472A",
  },
  btnSecondaryText: {
    color: "#E8472A",
    fontSize: 16,
    fontWeight: "600",
  },

  // ── Preview ──────────────────────────────────────────────────────────────────
  previewContainer: {
    flex: 1,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
  },
  retakeBtn: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retakeText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
