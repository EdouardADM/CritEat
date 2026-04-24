// Requires: npx expo install expo-image-picker
// app.json → plugins: [["expo-image-picker", {
//   "cameraPermission": "Criteat a besoin de la caméra pour photographier votre plat.",
//   "photosPermission": "Criteat a besoin d'accéder à vos photos."
// }]]

import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  photos: string[];
  onAddPhoto: (uri: string) => void;
  onRemovePhoto: (index: number) => void;
};

const CAMERA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: false,
  quality: 0.8,
};

export default function StepPhoto({ photos, onAddPhoto, onRemovePhoto }: Props) {
  const handleAdd = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission refusée",
        "L'accès à la caméra est requis. Activez-le dans les réglages."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync(CAMERA_OPTIONS);
    if (!result.canceled) {
      onAddPhoto(result.assets[0].uri);
    }
  };

  // ── État vide — placeholder cliquable ────────────────────────────────────────
  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.emptyPlaceholder} onPress={handleAdd}>
          <Ionicons name="camera-outline" size={56} color="#DDD" />
          <Text style={styles.emptyText}>Appuyez pour prendre une photo</Text>
        </Pressable>
        <Text style={styles.countHint}>Au moins 1 photo requise · max 5</Text>
      </View>
    );
  }

  // ── Grille avec vignettes ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {photos.map((uri, index) => (
          <View key={index} style={styles.cell}>
            <View style={styles.cellInner}>
              <Image source={{ uri }} style={styles.image} resizeMode="cover" />
              <Pressable
                style={styles.deleteBtn}
                onPress={() => onRemovePhoto(index)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons name="close-circle" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        ))}

        {photos.length < 5 && (
          <View style={styles.cell}>
            <Pressable style={[styles.cellInner, styles.addCell]} onPress={handleAdd}>
              <Ionicons name="add" size={32} color="#E8472A" />
            </Pressable>
          </View>
        )}
      </View>

      <Text style={styles.countHint}>{photos.length} / 5</Text>
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

  // ── Placeholder vide ─────────────────────────────────────────────────────────
  emptyPlaceholder: {
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
  emptyText: {
    fontSize: 15,
    color: "#AAA",
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // ── Grille ────────────────────────────────────────────────────────────────────
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "33.333%",
    padding: 4,
    aspectRatio: 1,
  },
  cellInner: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
  },
  image: {
    flex: 1,
  },
  deleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  addCell: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E8472A",
    borderStyle: "dashed",
    backgroundColor: "#FFF5F3",
  },

  // ── Compteur ─────────────────────────────────────────────────────────────────
  countHint: {
    fontSize: 13,
    color: "#AAA",
    textAlign: "center",
  },
});
