import { Image, StyleSheet, Text, View } from "react-native";

type Props = {
  uri?: string | null;
  initials: string;
  size: number;
  backgroundColor: string;
  textColor: string;
};

// Avatar réutilisable : affiche la photo de profil si elle existe, sinon un
// cercle coloré avec les initiales. À utiliser partout où un utilisateur
// apparaît (listes social/abonnés, auteurs d'avis…) pour un rendu cohérent.
export default function Avatar({ uri, initials, size, backgroundColor, textColor }: Props) {
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: "#F0F0F0" }}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor },
      ]}
    >
      <Text style={{ color: textColor, fontWeight: "700", fontSize: Math.round(size * 0.36) }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
});
