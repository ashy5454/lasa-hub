import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders } from "@/context/OrderContext";
import { useColors } from "@/hooks/useColors";
import { useWholesalers } from "@/context/WholesalersContext";
import { LasaLogo } from "@/components/LasaLogo";

export default function KiranaHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();
  const { wholesalers } = useWholesalers();
  const { orders } = useOrders();
  const hasOrderHistory = orders.length > 0;
  const [showAccount, setShowAccount] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greetingMorning") : hour < 17 ? t("greetingAfternoon") : t("greetingEvening");

  const accountTitle = language === "te" ? "మీ ఖాతా" : language === "hi" ? "आपका खाता" : "Your Account";
  const logoutLabel = language === "te" ? "లాగ్ అవుట్" : language === "hi" ? "लॉगआउट" : "Logout";
  const closeLabel = language === "te" ? "మూసేయి" : language === "hi" ? "बंद करें" : "Close";
  const phoneLabel = language === "te" ? "ఫోన్ నంబర్" : language === "hi" ? "फोन नंबर" : "Phone";
  const roleLabel = language === "te" ? "పాత్ర" : language === "hi" ? "भूमिका" : "Role";
  const kiranaLabel = language === "te" ? "కిరాణా దుకాణం" : language === "hi" ? "किराना दुकान" : "Kirana Shop";

  // Show the kirana's MOST RECENT supplier from order history, not an arbitrary
  // alphabetical default. Hide the line entirely if no orders yet.
  const lastOrder = orders.length > 0
    ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const lastSupplier = lastOrder
    ? wholesalers.find(w => w.id === lastOrder.wholesalerId)
    : null;
  const supplierLineText = lastSupplier ? `Last ordered from: ${lastSupplier.name}` : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.shopNameText}>{user?.name ?? user?.shopName ?? "Kirana Owner"}</Text>
          </View>
          {/* Brand mark + account icon, grouped so they sit cleanly on
              the right edge of the colored header. The outline ring on
              LasaLogo makes the red circle pop against the red
              background instead of disappearing into it. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LasaLogo size={36} outline />
            <TouchableOpacity
              onPress={() => setShowAccount(true)}
              style={[styles.accountBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
              activeOpacity={0.8}
            >
              <Feather name="user" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
        {supplierLineText && (
          <View style={styles.supplierRow}>
            <Feather name="truck" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.supplierText}>{supplierLineText}</Text>
          </View>
        )}
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text entering={FadeInDown.delay(140).springify()} style={[styles.sectionLabel, { color: colors.foreground }]}>
          {t("howToOrder")}
        </Animated.Text>

        {/* Camera */}
        <Animated.View entering={FadeInDown.delay(190).springify()}>
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/scan-order" as any); }}
            activeOpacity={0.82}
          >
            <View style={[styles.bigBtnIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="camera" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.bigBtnTitle, { color: colors.foreground }]}>{t("photoOfList")}</Text>
            <Text style={[styles.bigBtnSub, { color: colors.mutedForeground }]}>{t("photoOfListSub")}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Voice */}
        <Animated.View entering={FadeInDown.delay(260).springify()}>
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/voice-order" as any); }}
            activeOpacity={0.82}
          >
            <View style={[styles.bigBtnIcon, { backgroundColor: colors.accent + "18" }]}>
              <Feather name="mic" size={44} color={colors.accent} />
            </View>
            <Text style={[styles.bigBtnTitle, { color: colors.foreground }]}>{t("speakOrder")}</Text>
            <Text style={[styles.bigBtnSub, { color: colors.mutedForeground }]}>{t("speakOrderSub")}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Quick Reorder — only shown if there's an actual last order */}
        {hasOrderHistory && (
          <Animated.View entering={FadeInUp.delay(330).springify()}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/review?mode=quick" as any); }}
              activeOpacity={0.82}
            >
              <Feather name="refresh-cw" size={20} color={colors.accent} />
              <Text style={[styles.quickBtnText, { color: colors.accent }]}>{t("quickReorder")}</Text>
              <Feather name="chevron-right" size={18} color={colors.accent} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Tip */}
        <Animated.View entering={FadeInUp.delay(390).springify()} style={[styles.tipBox, { backgroundColor: colors.secondary }]}>
          <Feather name="info" size={16} color={colors.mutedForeground} />
          <Text style={[styles.tipText, { color: colors.mutedForeground }]}>{t("smsTip")}</Text>
        </Animated.View>
      </ScrollView>

      {/* Account Modal */}
      <Modal visible={showAccount} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.accountSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>{accountTitle}</Text>

            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.profileAvatarText}>
                  {(user?.name ?? "U").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "User"}</Text>
                <Text style={[styles.profileDetail, { color: colors.mutedForeground }]}>
                  {phoneLabel}: +91 {user?.phone}
                </Text>
                <Text style={[styles.profileDetail, { color: colors.mutedForeground }]}>
                  {roleLabel}: {kiranaLabel}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.logoutBtn, { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }]}
              onPress={async () => { setShowAccount(false); await logout(); }}
              activeOpacity={0.85}
            >
              <Feather name="log-out" size={18} color="#DC2626" />
              <Text style={[styles.logoutBtnText, { color: "#DC2626" }]}>{logoutLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => setShowAccount(false)}
            >
              <Text style={[styles.closeBtnText, { color: colors.foreground }]}>{closeLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1 },
  greetingText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular" },
  shopNameText: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  accountBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  supplierRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  supplierText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 12 },
  sectionLabel: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  bigBtn: { borderRadius: 20, borderWidth: 1.5, padding: 24, alignItems: "center", gap: 10 },
  bigBtnIcon: { width: 88, height: 88, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bigBtnTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bigBtnSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  quickBtn: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  quickBtnText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tipBox: { borderRadius: 12, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  // Account modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  accountSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  accountTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  profileCard: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", gap: 14, alignItems: "center" },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileDetail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  logoutBtn: { height: 54, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  logoutBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  closeBtn: { height: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  closeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
