import { useCallback, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

type Photo = { url: string; position: number };

type Props = {
  visible: boolean;
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 120; // px de drag vertical pour fermer

export default function ReviewPhotosModal({
  visible,
  photos,
  initialIndex = 0,
  onClose,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Drag vertical pour fermer (translateY ; le fond s'estompe avec le drag).
  const translateY = useSharedValue(0);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setActiveIndex(index);
    },
    []
  );

  // Remet l'index à 0 (ou initialIndex) et la position à chaque ouverture
  const handleShow = useCallback(() => {
    setActiveIndex(initialIndex);
    translateY.value = 0;
  }, [initialIndex, translateY]);

  // Swipe vers le bas → ferme. activeOffsetY : ne s'active que sur un mouvement
  // vertical net ; failOffsetX : laisse le carrousel gérer le swipe horizontal.
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([15, 15])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY); // bas uniquement
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 800) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 30, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    // le fond noir s'estompe à mesure qu'on glisse (1 → ~0.3 sur la distance d'un écran)
    opacity: Math.max(0.3, 1 - translateY.value / SCREEN_HEIGHT),
  }));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={handleShow}
    >
      {/* GestureHandlerRootView + SafeAreaProvider INTERNES : le Modal est une
          fenêtre native séparée → ni les gestes ni les insets du root racine ne
          l'atteignent. Sans ça, la croix se colle sous la barre de statut. */}
      <GestureHandlerRootView style={styles.fill}>
        <SafeAreaProvider>
          <GestureDetector gesture={dismissGesture}>
            <Animated.View style={[styles.fill, styles.bg, bgStyle]}>
              <Animated.View style={[styles.fill, contentStyle]}>
                <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  bg: {
    backgroundColor: "#000",
  },
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
