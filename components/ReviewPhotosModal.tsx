import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Photo = { url: string; position: number };

type Props = {
  visible: boolean;
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function ReviewPhotosModal({
  visible,
  photos,
  initialIndex = 0,
  onClose,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setActiveIndex(index);
    },
    []
  );

  // Remet l'index à 0 (ou initialIndex) à chaque ouverture
  const handleShow = useCallback(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={handleShow}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          {photos.length > 1 && (
            <Text style={styles.counter}>
              {activeIndex + 1} / {photos.length}
            </Text>
          )}
          <View style={styles.headerSpacer}>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Carrousel */}
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(photo) => String(photo.position)}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          initialScrollIndex={initialIndex}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <Image
                source={{ uri: item.url }}
                style={styles.photo}
                resizeMode="contain"
              />
            </View>
          )}
        />

        {/* Dots */}
        {photos.length > 1 && (
          <View style={styles.dots}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSpacer: {
    flex: 1,
    alignItems: "flex-end",
  },
  counter: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "600",
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
