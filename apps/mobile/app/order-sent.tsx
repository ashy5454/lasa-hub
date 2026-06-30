import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

export default function OrderSentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, language } = useLanguage();

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.2, { duration: 400 }),
      withTiming(1.0, { duration: 200 })
    );
    opacity.value = withTiming(1, { duration: 500 });
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const thanks =
    language === "te"
      ? "ధన్యవాదాలు!"
      : language === "hi"
      ? "धन्यवाद!"
      : "Thank You!";

  const orderPlaced =
    language === "te"
      ? "మీ ఆర్డర్ నమోదు అయింది"
      : language === "hi"
      ? "आपका ऑर्डर दर्ज हो गया"
      : "Your order has been placed";

  const smsMsg =
    language === "te"
      ? `మీ ఫోన్ నంబర్ +91 ${user?.phone ?? ""} కి SMS వస్తుంది`
      : language === "hi"
      ? `आपके नंबर +91 ${user?.phone ?? ""} पर SMS आएगा`
      : `You will receive an SMS on +91 ${user?.phone ?? ""}`;

  const supplierMsg =
    language === "te"
      ? "సరఫరాదారు మీ ఆర్డర్‌ని ధృవీకరిస్తాడు మరియు త్వరలో డెలివరీ సమయం తెలియజేస్తాడు."
      : language === "hi"
      ? "थोकदार आपके ऑर्डर की पुष्टि करेगा और डिलीवरी का समय बताएगा।"
      : "The supplier will confirm your order and send the delivery time shortly.";

  const backHome =
    language === "te"
      ? "హోమ్‌కి వెళ్ళండి"
      : language === "hi"
      ? "होम पर जाएं"
      : "Go to Home";

  const viewOrders =
    language === "te"
      ? "ఆర్డర్లు చూడండి"
      : language === "hi"
      ? "ऑर्डर देखें"
      : "View My Orders";

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
          paddingBottom: insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Big green checkmark */}
        <Animated.View style={[styles.iconWrap, { backgroundColor: colors.available + "18" }, iconStyle]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.available }]}>
            <Feather name="check" size={56} color="#FFF" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.textBlock}>
          <Text style={[styles.thanks, { color: colors.foreground }]}>{thanks}</Text>
          <Text style={[styles.orderPlaced, { color: colors.foreground }]}>{orderPlaced}</Text>

          <View style={[styles.infoCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Feather name="message-square" size={18} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>{smsMsg}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Feather name="truck" size={18} color={colors.accent} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{supplierMsg}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.btnBlock}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/orders")}
            activeOpacity={0.85}
          >
            <Feather name="list" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>{viewOrders}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.85}
          >
            <Feather name="home" size={20} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{backHome}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", alignItems: "center" },
  inner: { width: "100%", maxWidth: 480, paddingHorizontal: 28, alignItems: "center", gap: 28 },
  iconWrap: { width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center" },
  iconCircle: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  textBlock: { width: "100%", alignItems: "center", gap: 10 },
  thanks: { fontSize: 38, fontFamily: "Inter_700Bold", textAlign: "center" },
  orderPlaced: { fontSize: 22, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  infoCard: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 18, gap: 12, marginTop: 8 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  divider: { height: 1 },
  btnBlock: { width: "100%", gap: 12 },
  primaryBtn: { height: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryBtnText: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  secondaryBtn: { height: 54, borderRadius: 16, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  secondaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
