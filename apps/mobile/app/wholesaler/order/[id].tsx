import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, getUserHeaders } from "@/constants/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders, type OrderStatus } from "@/context/OrderContext";
import { useWholesalers } from "@/context/WholesalersContext";
import { getItemNameInLanguage, pickName } from "@/data/wholesalers";
import { useColors } from "@/hooks/useColors";
import { sameItem } from "@/utils/itemSynonyms";
import { neededInCatalogUnit } from "@/utils/units";
import { findCatalogItem as sharedFindCatalogItem } from "@/utils/catalogMatch";
import { wholesalerStockLabel } from "@/utils/stockLabels";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { LasaLogo } from "@/components/LasaLogo";

type LiveCatalogItem = {
  id: number;
  name: string;
  nameTe?: string;
  nameHi?: string;
  unit: string;
  pricePerUnit: number;
  available: boolean;
  stockQuantity: number | null;
  taxPercent: number | null;
};

const DELIVERY_TIMES = [
  "Tomorrow 9 AM",
  "Tomorrow 12 PM",
  "Tomorrow 5 PM",
  "Day after 9 AM",
  "Within 2 hours",
];

function getNumericQty(value: string): number {
  const m = value.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

export default function WholesalerOrderDetail() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, updateOrder } = useOrders();
  const { getById } = useWholesalers();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const order = orders.find(o => o.id === id);

  const myShop = useMemo(
    () => (user?.wholesalerId ? getById(user.wholesalerId) : undefined),
    [getById, user?.wholesalerId],
  );

  // Live catalog — pulled directly from the authenticated wholesaler endpoint
  // so it reflects what the wholesaler *just* added in My Stock, not the
  // possibly-stale public WholesalersContext cache.
  const [liveCatalog, setLiveCatalog] = useState<LiveCatalogItem[]>([]);
  // Fetch the kirana's own user record so we can render their verified
  // badge next to the shop name in the header.
  const [kiranaVerified, setKiranaVerified] = useState<boolean>(false);
  const headers = useMemo(() => getUserHeaders(user), [user?.phone, user?.role, user?.wholesalerId]);
  const refreshLiveCatalog = useCallback(async () => {
    if (!headers || user?.role !== "wholesaler") return;
    try {
      const { inventory } = await apiGet<{ inventory: LiveCatalogItem[] }>(
        "/api/wholesaler/inventory",
        headers,
      );
      setLiveCatalog(inventory ?? []);
    } catch (err) {
      console.warn("Failed to load live inventory:", (err as Error).message);
    }
  }, [headers, user?.role]);
  useEffect(() => { refreshLiveCatalog(); }, [refreshLiveCatalog]);
  useEffect(() => {
    if (!order?.kiranaPhone) return;
    apiGet<{ user: { verified?: boolean } }>(`/api/users/${encodeURIComponent(order.kiranaPhone)}`)
      .then(r => setKiranaVerified(!!r?.user?.verified))
      .catch(() => {});
  }, [order?.kiranaPhone]);

  // Live availability against my CURRENT inventory (don't trust baked-in flag).
  type LiveLine = {
    name: string;
    nameTe?: string;
    nameHi?: string;
    sourceLanguage?: string | null;
    displayName: string;
    quantity: string;
    needed: number;
    onHand: number | null;
    pricePerUnit: number | null;
    taxPercent: number;
    state: "in_stock" | "low_stock" | "out_of_stock" | "not_carried";
  };

  const live: LiveLine[] = useMemo(() => {
    if (!order) return [];
    const lines: LiveLine[] = [];
    const defaultTax = myShop?.defaultTaxPercent ?? 0;
    for (const item of order.items) {
      // We don't yet know the catalog unit; we resolve it after matching.
      const _need = getNumericQty(item.quantity);
      let need = _need;
      // Shared matcher: same 3-step fallback (exact → synonym → contains)
      // that the kirana side uses. Keeps both sides in lockstep.
      const cat = sharedFindCatalogItem(liveCatalog, item.name, item.nameTe, item.nameHi);
      const catForDisplay = cat ? { name: cat.name, nameTe: cat.nameTe ?? "", nameHi: cat.nameHi ?? "" } : undefined;
      const displayName = catForDisplay
        ? pickName(catForDisplay, language)
        : pickName(item, language);
      if (!cat) {
        lines.push({
          name: item.name, nameTe: item.nameTe, nameHi: item.nameHi, sourceLanguage: item.sourceLanguage,
          displayName,
          quantity: item.quantity, needed: need, onHand: 0, pricePerUnit: null, taxPercent: defaultTax, state: "not_carried",
        });
        continue;
      }
      // Unit-convert the kirana's qty into this catalog item's native unit
      // so the wholesaler-side decision (low / out / enough) uses the same
      // math as the kirana sees.
      const { needed: convertedNeed, compatible } = neededInCatalogUnit(item.quantity, cat.unit);
      need = compatible ? convertedNeed : _need;
      const onHand = cat.stockQuantity ?? null;
      const taxPct = (cat.taxPercent ?? defaultTax) || 0;
      let state: LiveLine["state"];
      if (!cat.available) state = "not_carried";
      else if (onHand == null) state = "in_stock";
      else if (onHand <= 0) state = "out_of_stock";
      else if (onHand < need) state = "low_stock";
      else state = "in_stock";
      lines.push({
        name: item.name, nameTe: item.nameTe, nameHi: item.nameHi, sourceLanguage: item.sourceLanguage,
        displayName,
        quantity: item.quantity, needed: need, onHand, pricePerUnit: cat.pricePerUnit, taxPercent: taxPct, state,
      });
    }
    return lines;
  }, [order, liveCatalog, myShop, language]);

  // Per-item GST: sum line × tax, fall back to default tax for items without their own.
  const computedSubtotal = useMemo(() => {
    let s = 0;
    for (const l of live) {
      if (l.state === "not_carried" || l.state === "out_of_stock") continue;
      if (l.pricePerUnit == null) continue;
      s += l.pricePerUnit * l.needed;
    }
    return Math.round(s * 100) / 100;
  }, [live]);

  const computedTax = useMemo(() => {
    let t = 0;
    for (const l of live) {
      if (l.state === "not_carried" || l.state === "out_of_stock") continue;
      if (l.pricePerUnit == null) continue;
      t += l.pricePerUnit * l.needed * (l.taxPercent / 100);
    }
    return Math.round(t * 100) / 100;
  }, [live]);

  const defaultTaxPct = myShop?.defaultTaxPercent ?? 0;
  const defaultDiscountPct = myShop?.defaultDiscountPercent ?? 0;
  const defaultDelivery = myShop?.defaultDeliveryTime ?? "";
  const missingCount = live.filter(l => l.state === "not_carried" || l.state === "out_of_stock").length;
  const lowStockCount = live.filter(l => l.state === "low_stock").length;

  const [totalAmount, setTotalAmount] = useState(order?.totalAmount?.toString() ?? "");
  const [subtotalAmount, setSubtotalAmount] = useState(order?.subtotalAmount?.toString() ?? "");
  const [tax, setTax] = useState(order?.tax?.toString() ?? "");
  const [discount, setDiscount] = useState(order?.discount?.toString() ?? "");
  const [deliveryTime, setDeliveryTime] = useState(order?.deliveryTime ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(order?.invoiceNumber ?? "");
  const [paymentStatus, setPaymentStatus] = useState(order?.paymentStatus ?? "pending");
  const [toAddress, setToAddress] = useState(order?.toAddress ?? order?.deliveryAddress ?? "");
  const [invoiceNote, setInvoiceNote] = useState(order?.invoiceNote ?? "");
  const [isSaving, setIsSaving] = useState(false);

  // Pre-fill fields for a fresh pending order from catalog + wholesaler defaults.
  useEffect(() => {
    if (!order) return;
    if (order.status !== "pending") return;
    if (!subtotalAmount && computedSubtotal > 0) {
      setSubtotalAmount(String(computedSubtotal));
      const taxAmt = +computedTax.toFixed(2);
      const discAmt = +(computedSubtotal * (defaultDiscountPct / 100)).toFixed(2);
      const total = +(computedSubtotal + taxAmt - discAmt).toFixed(2);
      if (!tax) setTax(String(taxAmt));
      if (!discount) setDiscount(String(discAmt));
      if (!totalAmount) setTotalAmount(String(total));
    }
    if (!deliveryTime && defaultDelivery) setDeliveryTime(defaultDelivery);
    if (!invoiceNumber) setInvoiceNumber(`INV-${order.id.slice(-6).toUpperCase()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, computedSubtotal, computedTax, defaultDiscountPct, defaultDelivery]);

  // Recompute total whenever subtotal/tax/discount change.
  const recomputeTotal = (sub: string, t: string, d: string) => {
    const s = Number(sub) || 0;
    const tx = Number(t) || 0;
    const dc = Number(d) || 0;
    setTotalAmount(String(+(s + tx - dc).toFixed(2)));
  };

  if (!order) return (
    <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
      <Text style={[{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 16 }]}>
        {t("noOrders")}
      </Text>
    </View>
  );

  const handleStatusChange = async (newStatus: OrderStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateOrder(order.id, { status: newStatus });
  };

  const handleConfirmOrder = async () => {
    if (!totalAmount) {
      Alert.alert(t("fillAmount"), t("fillAmount"));
      return;
    }
    if (!deliveryTime) {
      Alert.alert(t("selectDelivery"), t("selectDelivery"));
      return;
    }
    setIsSaving(true);
    await updateOrder(order.id, {
      status: "confirmed",
      totalAmount: parseFloat(totalAmount) || undefined,
      subtotalAmount: parseFloat(subtotalAmount) || undefined,
      tax: parseFloat(tax) || undefined,
      discount: parseFloat(discount) || undefined,
      invoiceNumber: invoiceNumber || undefined,
      paymentStatus: paymentStatus || undefined,
      toAddress: toAddress || undefined,
      fromAddress: myShop?.fromAddress || undefined,
      deliveryTime,
      invoiceNote,
    });
    setIsSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      t("orderConfirmed"),
      `${order.shopName} ${t("smsSent")}`,
      [{ text: t("ok"), onPress: () => router.back() }]
    );
  };

  const isEditable = order.status === "pending" || order.status === "confirmed";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{order.shopName}</Text>
            <VerifiedBadge verified={kiranaVerified} size="xs" />
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{order.items.length} items</Text>
        </View>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("orderItems")}</Text>

        {(missingCount > 0 || lowStockCount > 0) && order.status === "pending" && (
          <View style={[styles.warnBox, { backgroundColor: missingCount > 0 ? colors.unavailable + "14" : "#FEF3C7", borderColor: missingCount > 0 ? colors.unavailable + "55" : "#F59E0B" }]}>
            <Feather name="alert-triangle" size={16} color={missingCount > 0 ? colors.unavailable : "#92400E"} />
            <Text style={[styles.warnBoxText, { color: missingCount > 0 ? colors.unavailable : "#92400E" }]}>
              {missingCount > 0 && `${missingCount} item${missingCount > 1 ? "s" : ""} you don't sell`}
              {missingCount > 0 && lowStockCount > 0 && " · "}
              {lowStockCount > 0 && `${lowStockCount} running low`}
            </Text>
          </View>
        )}

        {live.map((l, i) => {
          const colorByState = {
            in_stock: colors.available,
            low_stock: "#F59E0B",
            out_of_stock: colors.unavailable,
            not_carried: colors.unavailable,
          }[l.state];
          const cat = sharedFindCatalogItem(liveCatalog, l.name, l.nameTe, l.nameHi);
          const unit = cat?.unit;
          const label = wholesalerStockLabel(
            (language as "en" | "te" | "hi") ?? "en",
            { state: l.state, onHand: l.onHand, needed: l.needed, unit },
          );
          return (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(i * 40).springify()}
              style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.foreground }]}>{l.displayName}</Text>
                {l.displayName !== l.name && (
                  <Text style={[styles.itemQty, { color: colors.mutedForeground, fontSize: 11 }]}>
                    {l.name}
                  </Text>
                )}
                <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>
                  needs {l.quantity}{l.pricePerUnit != null ? `  ·  ₹${l.pricePerUnit}/${(liveCatalog.find(c=>c.name.toLowerCase()===l.name.toLowerCase())?.unit) ?? "unit"}` : ""}
                </Text>
              </View>
              <View style={[styles.stateBadge, { backgroundColor: colorByState + "1f", borderColor: colorByState + "55" }]}>
                <View style={[styles.stateDot, { backgroundColor: colorByState }]} />
                <Text style={[styles.stateLabel, { color: colorByState }]}>{label}</Text>
              </View>
            </Animated.View>
          );
        })}

        {order.notes && (
          <View style={[styles.noteBox, { backgroundColor: colors.secondary }]}>
            <Feather name="message-circle" size={15} color={colors.mutedForeground} />
            <Text style={[styles.noteText, { color: colors.foreground }]}>{order.notes}</Text>
          </View>
        )}

        {isEditable && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("confirmOrder")}</Text>
            {computedSubtotal > 0 && order.status === "pending" && (
              <View style={[styles.autoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "40" }]}>
                <Feather name="zap" size={14} color={colors.primary} />
                <Text style={[styles.autoBoxText, { color: colors.primary }]}>
                  Auto-filled from your stock prices and shop settings ({defaultTaxPct}% tax, {defaultDiscountPct}% off). Edit any field if needed.
                </Text>
              </View>
            )}
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Subtotal (₹)</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  placeholder="1000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={subtotalAmount}
                  onChangeText={(v) => { setSubtotalAmount(v); recomputeTotal(v, tax, discount); }}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("totalAmount")} (₹)</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  placeholder="1200"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tax (₹)</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={tax}
                  onChangeText={(v) => { setTax(v); recomputeTotal(subtotalAmount, v, discount); }}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Discount (₹)</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={discount}
                  onChangeText={(v) => { setDiscount(v); recomputeTotal(subtotalAmount, tax, v); }}
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Invoice Number</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              placeholder="INV-1001"
              placeholderTextColor={colors.mutedForeground}
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Payment Status</Text>
            <TextInput
              style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              placeholder="pending / paid / partial"
              placeholderTextColor={colors.mutedForeground}
              value={paymentStatus}
              onChangeText={setPaymentStatus}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Delivery Address</Text>
            <TextInput
              style={[styles.notesInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              placeholder="Address"
              placeholderTextColor={colors.mutedForeground}
              value={toAddress}
              onChangeText={setToAddress}
              multiline
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("deliveryTime")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.timePills}>
              {DELIVERY_TIMES.map(timeOpt => (
                <TouchableOpacity
                  key={timeOpt}
                  style={[styles.timePill, {
                    backgroundColor: deliveryTime === timeOpt ? colors.primary : colors.card,
                    borderColor: deliveryTime === timeOpt ? colors.primary : colors.border,
                  }]}
                  onPress={() => setDeliveryTime(timeOpt)}
                >
                  <Text style={[styles.timePillText, { color: deliveryTime === timeOpt ? "#FFF" : colors.foreground }]}>{timeOpt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("deliveryNote")}</Text>
            <TextInput
              style={[styles.notesInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              placeholder={t("noteHint")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={invoiceNote}
              onChangeText={setInvoiceNote}
            />

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.7 : 1 }]}
              onPress={handleConfirmOrder}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="check-circle" size={22} color="#FFF" />
                  <Text style={styles.confirmBtnText}>{t("confirmOrder")}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {order.status === "confirmed" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#7C3AED" }]}
            onPress={() => handleStatusChange("out_for_delivery")}
            activeOpacity={0.85}
          >
            <Feather name="truck" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>{t("deliverySent")}</Text>
          </TouchableOpacity>
        )}

        {order.status === "out_for_delivery" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.available }]}
            onPress={() => handleStatusChange("delivered")}
            activeOpacity={0.85}
          >
            <Feather name="package" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>{t("delivered")}</Text>
          </TouchableOpacity>
        )}

        {/* Wholesaler-side rating prompt — appears after delivery so the
            wholesaler can rate the kirana's behaviour (on-time payment,
            easy to deal with, etc). Once submitted, it disappears. */}
        {order.status === "delivered" && !/\[kirana_rating:\d\]/i.test(order.notes ?? "") && (
          <WholesalerRatesKirana orderId={order.id} kiranaName={order.shopName} colors={colors} />
        )}
      </ScrollView>
    </View>
  );
}

function WholesalerRatesKirana({ orderId, kiranaName, colors }: { orderId: string; kiranaName: string; colors: any }) {
  const { submitOrderRating, refreshOrders } = useOrders();
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const onRate = async (rating: number) => {
    setSubmitting(true);
    try {
      await submitOrderRating(orderId, rating);
      await refreshOrders();
      setDone(true);
    } catch (err: any) {
      Alert.alert("Could not submit rating", err?.message ?? "Try again.");
    } finally {
      setSubmitting(false);
    }
  };
  if (done) {
    return (
      <View style={[styles.ratingDoneBox, { backgroundColor: colors.available + "14", borderColor: colors.available + "55" }]}>
        <Feather name="check-circle" size={18} color={colors.available} />
        <Text style={{ color: colors.available, fontFamily: "Inter_600SemiBold", flex: 1 }}>
          Thanks for rating {kiranaName}!
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.ratingBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.ratingTitle, { color: colors.foreground }]}>How was this kirana?</Text>
      <Text style={[styles.ratingSubtitle, { color: colors.mutedForeground }]}>
        On-time payment, easy to talk to, fair returns — your rating helps other wholesalers.
      </Text>
      <View style={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map((v) => (
          <TouchableOpacity key={v} disabled={submitting} onPress={() => onRate(v)} style={styles.starBtn}>
            <Feather name="star" size={28} color="#F59E0B" />
            <Text style={[styles.starLabel, { color: colors.mutedForeground }]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 12 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  itemCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 14 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  noteBox: { borderRadius: 12, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  autoBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  autoBoxText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  warnBoxText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  stateBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  stateLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fieldInput: { height: 50, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontFamily: "Inter_500Medium" },
  timePills: { gap: 8, paddingBottom: 4 },
  timePill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, borderWidth: 1.5 },
  timePillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  notesInput: { borderWidth: 1.5, borderRadius: 14, padding: 14, minHeight: 70, fontSize: 14, fontFamily: "Inter_400Regular" },
  confirmBtn: { height: 62, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  confirmBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  actionBtn: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  actionBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  ratingBox: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, marginTop: 12 },
  ratingTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  ratingSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  ratingStars: { flexDirection: "row", justifyContent: "space-between", paddingTop: 4 },
  starBtn: { alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 4 },
  starLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  ratingDoneBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
});
