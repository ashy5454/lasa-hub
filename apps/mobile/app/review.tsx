import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInRight, FadeInLeft, Layout } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useOrders, type OrderItem } from "@/context/OrderContext";
import { useWholesalers } from "@/context/WholesalersContext";
import { getItemNameInLanguage, pickName, type Wholesaler } from "@/data/wholesalers";
import { kiranaStockLabel } from "@/utils/stockLabels";
import { findSimilarCatalogItems } from "@/utils/catalogMatch";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useColors } from "@/hooks/useColors";
import { LasaLogo } from "@/components/LasaLogo";

function parseQty(q: string): number {
  const m = q.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

const STEP_LABELS = ["Items", "Supplier", "Confirm"];

export default function ReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { createOrder, orders } = useOrders();
  const { wholesalers, isAvailable, stockFor, rankSuppliers, refresh: refreshWholesalers } = useWholesalers();

  useEffect(() => { refreshWholesalers(); }, [refreshWholesalers]);

  const params = useLocalSearchParams<{ items?: string; mode?: string }>();

  // ── Step state ──────────────────────────────────────────────
  const [step, setStep] = useState(0); // 0=Items, 1=Supplier, 2=Confirm

  // ── Order data ───────────────────────────────────────────────
  const [items, setItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState(user?.shopName ?? "");
  const [editingAddress, setEditingAddress] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // ── Wholesaler ───────────────────────────────────────────────
  const [selectedWholesaler, setSelectedWholesaler] = useState<Wholesaler>(wholesalers[0]);
  const [wholesalerSearch, setWholesalerSearch] = useState("");
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogWholesaler, setCatalogWholesaler] = useState<Wholesaler>(wholesalers[0]);

  useEffect(() => {
    if (!wholesalers.length) return;
    if (!wholesalers.find(w => w.id === selectedWholesaler?.id)) {
      setSelectedWholesaler(wholesalers[0]);
      setCatalogWholesaler(wholesalers[0]);
    }
  }, [wholesalers, selectedWholesaler?.id]);

  // ── Item editing ─────────────────────────────────────────────
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);

  // ── Load items from params ───────────────────────────────────
  useEffect(() => {
    let baseItems: OrderItem[] = [];
    if (params.mode === "quick") {
      const sorted = [...orders].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const last = sorted[0];
      if (last) {
        baseItems = last.items.map(i => ({
          name: i.name, nameTe: i.nameTe, nameHi: i.nameHi,
          sourceLanguage: i.sourceLanguage, quantity: i.quantity, available: true,
        }));
        if (last.wholesalerId) {
          const lastWs = wholesalers.find(w => w.id === last.wholesalerId);
          if (lastWs) setSelectedWholesaler(lastWs);
        }
      }
    } else if (params.items) {
      try { baseItems = JSON.parse(decodeURIComponent(params.items)); } catch {}
    }
    setItems(baseItems.map(i => ({
      ...i,
      available: isAvailable(selectedWholesaler?.id ?? "", i.name),
    })));
  }, [params.items, params.mode, orders, wholesalers]);

  useEffect(() => {
    setItems(prev => prev.map(i => ({
      ...i,
      available: isAvailable(selectedWholesaler?.id ?? "", i.name),
    })));
  }, [selectedWholesaler, isAvailable]);

  // ── Item CRUD ────────────────────────────────────────────────
  const removeItem = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const startEdit = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingIdx(idx);
    setEditQtyValue(items[idx].quantity);
    setEditNameValue(items[idx].name);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const newName = editNameValue.trim() || items[editingIdx].name;
    setItems(prev => prev.map((item, i) =>
      i === editingIdx
        ? {
            ...item,
            name: newName,
            quantity: editQtyValue,
            ...(newName.toLowerCase() !== item.name.toLowerCase()
              ? { nameTe: undefined, nameHi: undefined }
              : {}),
          }
        : item,
    ));
    setEditingIdx(null);
    setEditQtyValue("");
    setEditNameValue("");
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newItem: OrderItem = {
      name: newItemName.trim(),
      quantity: newItemQty.trim() || "1",
      available: isAvailable(selectedWholesaler?.id ?? "", newItemName.trim()),
    };
    setItems(prev => [...prev, newItem]);
    setNewItemName("");
    setNewItemQty("");
    setShowAddRow(false);
  };

  // ── Stock computations ───────────────────────────────────────
  const itemStocks = items.map(i =>
    stockFor(selectedWholesaler?.id ?? "", i.name, i.quantity, i.nameTe, i.nameHi),
  );

  const suggestions = items.length
    ? rankSuppliers(
        items.map(i => ({ name: i.name, quantity: i.quantity, nameTe: i.nameTe, nameHi: i.nameHi })),
        { lat: user?.lat, lng: user?.lng },
      ).slice(0, 5)
    : [];

  const minOrderViolations = itemStocks.filter(s => s.state === "below_min_order");

  const getItemDisplayName = (item: OrderItem) => {
    if (language === "en") return item.name;
    const w = selectedWholesaler ?? wholesalers[0];
    if (w) {
      const cat = w.catalog.find(c => c.name.toLowerCase() === item.name.toLowerCase());
      if (cat) return getItemNameInLanguage(cat, language);
    }
    return pickName(item, language);
  };

  // ── Send ─────────────────────────────────────────────────────
  const tell = (title: string, body?: string) => {
    const msg = body ? `${title}\n\n${body}` : title;
    console.warn("[send-order]", title, body ?? "");
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(msg);
    } else {
      Alert.alert(title, body);
    }
  };

  const handleSendOrder = async () => {
    if (!user?.phone) { tell("Please login again before placing an order."); return; }
    if (items.length === 0) { tell(t("addItem")); return; }
    if (!selectedWholesaler?.id) { tell("Pick a supplier first"); return; }
    if (!deliveryAddress.trim()) { tell("Delivery address is required", "Add your shop address so the supplier knows where to deliver."); return; }
    if (minOrderViolations.length > 0) {
      const first = minOrderViolations[0];
      const unit = first.catalog?.unit ?? "";
      tell("Minimum order not met", `Minimum for ${first.catalog?.name ?? "one item"} is ${first.minOrderQty}${unit ? " " + unit : ""}. Increase the quantity or pick a different shop.`);
      return;
    }
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createOrder({
        kiranaPhone: user.phone,
        kiranaName: user?.name ?? "Shop Owner",
        shopName: user?.shopName ?? "My Store",
        wholesalerId: selectedWholesaler.id,
        items,
        status: "pending",
        notes,
        deliveryAddress,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/order-sent" as any);
    } catch (err: any) {
      console.error("[send-order] createOrder failed", err);
      tell(
        "Couldn't send the order",
        err?.message
          ? `${err.message}\n\nYour items are still here — tap Send again.`
          : "Network or server error. Your items are still here — tap Send again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  // ── Navigation ───────────────────────────────────────────────
  const goNext = () => {
    if (step === 0 && items.length === 0) { tell(t("addItem")); return; }
    if (step === 1 && !selectedWholesaler?.id) { tell("Pick a supplier first"); return; }
    setStep(s => s + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goBack = () => {
    if (step === 0) { router.back(); return; }
    setStep(s => s - 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Bill estimate ────────────────────────────────────────────
  const billEstimate = suggestions.find(s => s.wholesaler.id === selectedWholesaler?.id);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header with stepper ── */}
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          borderBottomColor: colors.border,
        }]}
      >
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.stepperRow}>
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <View style={[styles.stepLine, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
              )}
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  {
                    backgroundColor: i < step ? colors.primary : i === step ? colors.primary : colors.secondary,
                    borderColor: i <= step ? colors.primary : colors.border,
                  },
                ]}>
                  {i < step
                    ? <Feather name="check" size={11} color="#FFF" />
                    : <Text style={[styles.stepDotText, { color: i === step ? "#FFF" : colors.mutedForeground }]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, { color: i === step ? colors.foreground : colors.mutedForeground }]}>
                  {label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        <LasaLogo size={28} />
      </Animated.View>

      {/* ── Step 0: Items ── */}
      {step === 0 && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInRight.duration(260)}>
            {/* Coverage banner */}
            {items.length > 0 && (() => {
              const inStock = itemStocks.filter(s => s.state === "in_stock").length;
              const low = itemStocks.filter(s => s.state === "low_stock").length;
              const missing = itemStocks.filter(s => s.state === "not_carried" || s.state === "out_of_stock").length;
              const allOk = missing === 0 && low === 0;
              const color = allOk ? colors.available : missing > 0 ? colors.unavailable : "#F59E0B";
              return (
                <View style={[styles.coverBanner, { backgroundColor: color + "14", borderColor: color + "55" }]}>
                  <Feather name={allOk ? "check-circle" : "alert-circle"} size={16} color={color} />
                  <Text style={[styles.coverText, { color }]}>
                    {inStock}/{items.length} ready at {selectedWholesaler?.name}
                    {low > 0 ? `  ·  ${low} low` : ""}
                    {missing > 0 ? `  ·  ${missing} not here` : ""}
                  </Text>
                </View>
              );
            })()}

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t("itemsFound")} ({items.length})
            </Text>

            {items.map((item, i) => (
              <Animated.View
                key={`${item.name}-${i}`}
                entering={FadeInDown.delay(60 + i * 40).springify()}
                layout={Layout.springify()}
              >
                {editingIdx === i ? (
                  <View style={[styles.itemCardEditing, { backgroundColor: colors.primary + "10", borderColor: colors.primary }]}>
                    <Text style={[styles.editFieldLabel, { color: colors.mutedForeground }]}>Item name</Text>
                    <TextInput
                      style={[styles.editNameInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.background }]}
                      value={editNameValue}
                      onChangeText={setEditNameValue}
                      placeholder="e.g. Rice, Turmeric, Haldi"
                      placeholderTextColor={colors.mutedForeground}
                      autoFocus
                    />
                    <Text style={[styles.editFieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Quantity</Text>
                    <View style={styles.editRow}>
                      <TextInput
                        style={[styles.editQtyInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.background }]}
                        value={editQtyValue}
                        onChangeText={setEditQtyValue}
                        placeholder={t("qtyPlaceholder")}
                        placeholderTextColor={colors.mutedForeground}
                      />
                      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveEdit}>
                        <Text style={styles.saveBtnText}>{t("save")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]} onPress={() => setEditingIdx(null)}>
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (() => {
                  const s = itemStocks[i];
                  const unit = s?.catalog?.unit ?? "";
                  const orderedUnit = (() => {
                    const m = String(item.quantity ?? "").match(/[a-zA-Zఅ-౿अ-ॿ]+\s*$/);
                    return m ? m[0].trim() : "";
                  })();
                  const stateColor =
                    s?.state === "in_stock" ? colors.available :
                    (s?.state === "low_stock" || s?.state === "below_min_order" || s?.state === "wrong_unit") ? "#F59E0B" :
                    colors.unavailable;
                  const stateLabel = s
                    ? kiranaStockLabel(
                        (language as "en" | "te" | "hi") ?? "en",
                        { state: s.state, onHand: s.onHand, needed: s.needed, minOrderQty: s.minOrderQty, unit, orderedUnit },
                      )
                    : "";
                  const didYouMean = s?.state === "not_carried" && selectedWholesaler
                    ? findSimilarCatalogItems(selectedWholesaler.catalog, item.name, 3)
                    : [];
                  return (
                    <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.stockDot, { backgroundColor: stateColor }]} />
                      <View style={styles.itemCenter}>
                        <Text style={[styles.itemName, { color: colors.foreground }]}>{getItemDisplayName(item)}</Text>
                        <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>
                          {item.quantity}
                          {s?.catalog?.pricePerUnit != null ? `  ·  ₹${s.catalog.pricePerUnit}/${s.catalog.unit}` : ""}
                        </Text>
                        {s?.catalog && s.minOrderQty > 0 && (
                          <Text style={[styles.minOrderHint, { color: colors.mutedForeground }]}>
                            min order: {s.minOrderQty} {s.catalog.unit}
                          </Text>
                        )}
                        <Text style={[styles.stockReason, { color: stateColor }]}>{stateLabel}</Text>
                        {didYouMean.length > 0 && (
                          <View style={styles.suggestionsRow}>
                            <Text style={[styles.suggestionsLabel, { color: colors.mutedForeground }]}>
                              {language === "hi" ? "क्या आपका मतलब था:" : language === "te" ? "మీరు అడిగినది:" : "Did you mean:"}
                            </Text>
                            <View style={styles.suggestionsChips}>
                              {didYouMean.map((sg, sgIdx) => (
                                <TouchableOpacity
                                  key={sgIdx}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, name: sg.name, nameTe: sg.nameTe ?? "", nameHi: sg.nameHi ?? "" } : it));
                                  }}
                                  style={[styles.suggestionChip, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "10" }]}
                                >
                                  <Text style={[styles.suggestionChipText, { color: colors.primary }]}>{sg.name}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity
                                onPress={() => setShowCatalogModal(true)}
                                style={[styles.suggestionChip, { borderColor: colors.border }]}
                              >
                                <Feather name="list" size={11} color={colors.mutedForeground} />
                                <Text style={[styles.suggestionChipText, { color: colors.mutedForeground, marginLeft: 4 }]}>
                                  {language === "hi" ? "पूरी सूची देखें" : language === "te" ? "మొత్తం జాబితా" : "see full list"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity style={styles.actionIconBtn} onPress={() => startEdit(i)}>
                          <Feather name="edit-2" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionIconBtn} onPress={() => removeItem(i)}>
                          <Feather name="trash-2" size={16} color={colors.destructive} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}
              </Animated.View>
            ))}

            {showAddRow ? (
              <Animated.View entering={FadeInDown.springify()} style={[styles.addRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.addInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder={t("itemNamePlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  autoFocus
                />
                <TextInput
                  style={[styles.addQtyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder={t("qtyPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemQty}
                  onChangeText={setNewItemQty}
                />
                <TouchableOpacity style={[styles.addConfirmBtn, { backgroundColor: colors.primary }]} onPress={addItem}>
                  <Feather name="plus" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAddRow(false)}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <TouchableOpacity
                style={[styles.addItemBtn, { borderColor: colors.primary, backgroundColor: colors.primary + "10" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddRow(true); }}
              >
                <Feather name="plus" size={18} color={colors.primary} />
                <Text style={[styles.addItemBtnText, { color: colors.primary }]}>{t("addItem")}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      )}

      {/* ── Step 1: Supplier ── */}
      {step === 1 && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInRight.duration(260)} style={{ gap: 10 }}>
            {/* Search */}
            <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search by name or location…"
                placeholderTextColor={colors.mutedForeground}
                value={wholesalerSearch}
                onChangeText={setWholesalerSearch}
                autoCapitalize="none"
              />
              {wholesalerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setWholesalerSearch("")}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {/* Ranked supplier list */}
            {(suggestions.length > 0 ? suggestions : wholesalers.map(ws => ({ wholesaler: ws, inStockCount: 0, lowStockCount: 0, missingCount: 0, subtotal: 0, tax: 0, discount: 0, total: 0, distanceKm: null as any }))).filter(({ wholesaler: ws }) => {
              const q = wholesalerSearch.toLowerCase();
              if (!q) return true;
              return ws.name.toLowerCase().includes(q) || (ws.location ?? "").toLowerCase().includes(q);
            }).map(({ wholesaler: ws, inStockCount, total, distanceKm }, idx) => {
              const isSelected = ws.id === selectedWholesaler?.id;
              const coverage = items.length ? inStockCount : null;
              return (
                <Animated.View
                  key={ws.id}
                  entering={FadeInDown.delay(idx * 50).springify()}
                >
                  <TouchableOpacity
                    style={[styles.supplierCard, {
                      backgroundColor: isSelected ? colors.primary + "10" : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    }]}
                    onPress={() => {
                      setSelectedWholesaler(ws);
                      setCatalogWholesaler(ws);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.82}
                  >
                    <View style={styles.supplierCardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.supplierName, { color: colors.foreground }]} numberOfLines={1}>{ws.name}</Text>
                          <VerifiedBadge verified={ws.verified} size="xs" />
                          {idx === 0 && suggestions.length > 0 && (
                            <View style={[styles.bestBadge, { backgroundColor: colors.available + "22" }]}>
                              <Text style={[styles.bestBadgeText, { color: colors.available }]}>Best match</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.supplierMeta, { color: colors.mutedForeground }]}>
                          {ws.distance && ws.distance !== "Unknown" ? `${ws.distance}  ·  ` : ""}★ {ws.rating}
                          {distanceKm != null ? `  ·  ${distanceKm.toFixed(1)} km` : ""}
                        </Text>
                        {ws.specialOffer && (
                          <View style={[styles.offerBadge, { backgroundColor: colors.available + "18" }]}>
                            <Text style={[styles.offerText, { color: colors.available }]}>{ws.specialOffer}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        {coverage !== null && (
                          <Text style={[styles.stockCount, { color: inStockCount === items.length ? colors.available : inStockCount > 0 ? "#F59E0B" : colors.unavailable }]}>
                            {inStockCount}/{items.length} in stock
                          </Text>
                        )}
                        {total > 0 && (
                          <Text style={[styles.supplierPrice, { color: colors.foreground }]}>≈ ₹{total.toLocaleString()}</Text>
                        )}
                        {isSelected && <Feather name="check-circle" size={20} color={colors.primary} />}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.viewCatalogBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
                      onPress={() => { setCatalogWholesaler(ws); setShowCatalogModal(true); }}
                    >
                      <Feather name="list" size={13} color={colors.accent} />
                      <Text style={[styles.viewCatalogText, { color: colors.accent }]}>{t("viewCatalog")}</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </Animated.View>
        </ScrollView>
      )}

      {/* ── Step 2: Confirm ── */}
      {step === 2 && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInRight.duration(260)} style={{ gap: 12 }}>
            {/* Supplier summary */}
            <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.confirmCardHead, { borderBottomColor: colors.border }]}>
                <Feather name="truck" size={15} color={colors.primary} />
                <Text style={[styles.confirmCardTitle, { color: colors.primary }]}>Supplier</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>Name</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={[styles.confirmVal, { color: colors.foreground }]}>{selectedWholesaler?.name}</Text>
                  <VerifiedBadge verified={selectedWholesaler?.verified} size="xs" />
                </View>
              </View>
              {selectedWholesaler?.location && (
                <View style={styles.confirmRow}>
                  <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>Location</Text>
                  <Text style={[styles.confirmVal, { color: colors.foreground }]}>{selectedWholesaler.location}</Text>
                </View>
              )}
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>Items</Text>
                <Text style={[styles.confirmVal, { color: colors.foreground }]}>{items.length} items</Text>
              </View>
              {billEstimate && (
                <View style={styles.confirmRow}>
                  <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>
                    {billEstimate.inStockCount}/{items.length} in stock
                  </Text>
                  <Text style={[styles.confirmVal, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                    ≈ ₹{billEstimate.total.toLocaleString()}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.changeSupplierLink}
                onPress={() => setStep(1)}
              >
                <Text style={[styles.changeSupplierText, { color: colors.primary }]}>Change supplier</Text>
              </TouchableOpacity>
            </View>

            {/* Items mini-list */}
            <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.confirmCardHead, { borderBottomColor: colors.border }]}>
                <Feather name="shopping-bag" size={15} color={colors.primary} />
                <Text style={[styles.confirmCardTitle, { color: colors.primary }]}>Order items</Text>
              </View>
              {items.slice(0, 5).map((item, i) => {
                const s = itemStocks[i];
                const stateColor = s?.state === "in_stock" ? colors.available : s?.state === "low_stock" ? "#F59E0B" : colors.unavailable;
                return (
                  <View key={i} style={[styles.miniItemRow, { borderBottomColor: colors.border, borderBottomWidth: i < Math.min(4, items.length - 1) ? StyleSheet.hairlineWidth : 0 }]}>
                    <View style={[styles.stockDot, { backgroundColor: stateColor, marginTop: 2 }]} />
                    <Text style={[styles.miniItemName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{getItemDisplayName(item)}</Text>
                    <Text style={[styles.miniItemQty, { color: colors.mutedForeground }]}>{item.quantity}</Text>
                  </View>
                );
              })}
              {items.length > 5 && (
                <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>+{items.length - 5} more items</Text>
              )}
              <TouchableOpacity style={styles.changeSupplierLink} onPress={() => setStep(0)}>
                <Text style={[styles.changeSupplierText, { color: colors.primary }]}>Edit items</Text>
              </TouchableOpacity>
            </View>

            {/* Delivery address — Option D style */}
            <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.confirmCardHead, { borderBottomColor: colors.border }]}>
                <Feather name="map-pin" size={15} color={colors.primary} />
                <Text style={[styles.confirmCardTitle, { color: colors.primary }]}>Delivery address</Text>
                {!editingAddress && (
                  <TouchableOpacity onPress={() => setEditingAddress(true)} style={styles.editAddrBtn}>
                    <Text style={[styles.changeSupplierText, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editingAddress ? (
                <View style={{ padding: 12, gap: 8 }}>
                  <TextInput
                    style={[styles.addrInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.background }]}
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    placeholder="Enter your shop address"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary, alignSelf: "flex-end", paddingHorizontal: 20 }]}
                    onPress={() => setEditingAddress(false)}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.addrDisplay}>
                  <Text style={[styles.addrText, { color: deliveryAddress ? colors.foreground : colors.mutedForeground }]}>
                    {deliveryAddress || "No address set — tap Edit to add"}
                  </Text>
                </View>
              )}
            </View>

            {/* Notes */}
            <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.confirmCardHead, { borderBottomColor: colors.border }]}>
                <Feather name="message-circle" size={15} color={colors.primary} />
                <Text style={[styles.confirmCardTitle, { color: colors.primary }]}>{t("notes")} (optional)</Text>
              </View>
              <TextInput
                style={[styles.notesInput, { borderColor: "transparent", backgroundColor: "transparent", color: colors.foreground }]}
                placeholder={t("noteHint")}
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            {/* Bill estimate */}
            {billEstimate && (
              <View style={[styles.billCard, { backgroundColor: colors.primary + "0e", borderColor: colors.primary + "55" }]}>
                <Text style={[styles.billTitle, { color: colors.foreground }]}>Estimated bill</Text>
                <View style={styles.confirmRow}>
                  <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>
                    Subtotal ({billEstimate.inStockCount + billEstimate.lowStockCount}/{items.length} items)
                  </Text>
                  <Text style={[styles.confirmVal, { color: colors.foreground }]}>₹{billEstimate.subtotal.toLocaleString()}</Text>
                </View>
                {billEstimate.tax > 0 && (
                  <View style={styles.confirmRow}>
                    <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>Tax</Text>
                    <Text style={[styles.confirmVal, { color: colors.foreground }]}>₹{billEstimate.tax.toLocaleString()}</Text>
                  </View>
                )}
                {billEstimate.discount > 0 && (
                  <View style={styles.confirmRow}>
                    <Text style={[styles.confirmKey, { color: colors.mutedForeground }]}>Discount</Text>
                    <Text style={[styles.confirmVal, { color: colors.available }]}>−₹{billEstimate.discount.toLocaleString()}</Text>
                  </View>
                )}
                <View style={[styles.billDivider, { backgroundColor: colors.border }]} />
                <View style={styles.confirmRow}>
                  <Text style={[styles.billTotal, { color: colors.foreground }]}>Total to pay</Text>
                  <Text style={[styles.billTotalVal, { color: colors.primary }]}>₹{billEstimate.total.toLocaleString()}</Text>
                </View>
                {billEstimate.missingCount > 0 && (
                  <Text style={[styles.billNote, { color: colors.mutedForeground }]}>
                    {billEstimate.missingCount} item{billEstimate.missingCount > 1 ? "s" : ""} not at this shop — wholesaler may suggest a substitute.
                  </Text>
                )}
              </View>
            )}

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: isSending ? 0.7 : 1 }]}
              onPress={handleSendOrder}
              disabled={isSending}
              activeOpacity={0.85}
            >
              {isSending ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Feather name="send" size={22} color="#FFF" />
                  <Text style={styles.sendBtnText}>
                    {billEstimate ? `Send Order · ₹${billEstimate.total.toLocaleString()}` : t("sendOrder")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={[styles.sendHint, { color: colors.mutedForeground }]}>{t("sendHint")}</Text>
          </Animated.View>
        </ScrollView>
      )}

      {/* ── Bottom continue/next bar (steps 0 and 1) ── */}
      {step < 2 && (
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={[styles.bottomBar, {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 12,
          }]}
        >
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.primary }]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {step === 0 ? "Choose Supplier →" : "Review Order →"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Catalog Modal ── */}
      <Modal visible={showCatalogModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Everything at {catalogWholesaler?.name}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>
              Green dot = in stock, red = out.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {catalogWholesaler?.catalog.map((cat, i) => {
                const displayName = getItemNameInLanguage(cat, language);
                return (
                  <View
                    key={i}
                    style={[styles.catRow, { borderBottomColor: colors.border, opacity: cat.available ? 1 : 0.55 }]}
                  >
                    <View style={[styles.catDot, { backgroundColor: cat.available ? colors.available : colors.unavailable }]} />
                    <View style={styles.catInfo}>
                      <Text style={[styles.catName, { color: colors.foreground }]}>{displayName}</Text>
                      {cat.offer && (
                        <View style={[styles.catOfferBadge, { backgroundColor: colors.available + "18" }]}>
                          <Text style={[styles.catOfferText, { color: colors.available }]}>{cat.offer}</Text>
                        </View>
                      )}
                      <Text style={[styles.catMoq, { color: colors.mutedForeground }]}>
                        {t("minOrder")}: {cat.minOrderQty} {cat.unit}
                      </Text>
                    </View>
                    <View style={styles.catPriceBlock}>
                      <Text style={[styles.catPrice, { color: cat.available ? colors.foreground : colors.mutedForeground }]}>
                        ₹{cat.pricePerUnit}
                      </Text>
                      <Text style={[styles.catUnit, { color: colors.mutedForeground }]}>/{cat.unit}</Text>
                      {!cat.available && (
                        <Text style={[styles.noStockLabel, { color: colors.unavailable }]}>{t("noStock")}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.selectSupplierBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setSelectedWholesaler(catalogWholesaler);
                setShowCatalogModal(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
            >
              <Text style={styles.selectSupplierBtnText}>{t("selectThisSupplier")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => setShowCatalogModal(false)}
            >
              <Text style={[styles.modalCloseBtnText, { color: colors.foreground }]}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },

  // Header + stepper
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 0, flex: 1, justifyContent: "center", paddingHorizontal: 4 },
  stepItem: { alignItems: "center", gap: 3 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  stepDotText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  stepLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  stepLine: { flex: 1, height: 1.5, marginBottom: 12, marginHorizontal: 2 },

  // Coverage banner
  coverBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  coverText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Section title
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 4 },

  // Items
  itemCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 4 },
  stockDot: { width: 11, height: 11, borderRadius: 6, flexShrink: 0 },
  itemCenter: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  stockReason: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  minOrderHint: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, fontStyle: "italic" },
  itemActions: { flexDirection: "row", gap: 4 },
  actionIconBtn: { padding: 8, borderRadius: 8 },

  // Edit
  itemCardEditing: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 10, marginBottom: 4 },
  editFieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  editNameInput: { height: 42, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Inter_500Medium", fontSize: 15 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editQtyInput: { flex: 1, height: 42, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { height: 42, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#FFF", fontSize: 14, fontFamily: "Inter_700Bold" },
  cancelBtn: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Suggestions
  suggestionsRow: { marginTop: 6, gap: 4 },
  suggestionsLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  suggestionsChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suggestionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center" },
  suggestionChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Add item
  addRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 10, gap: 8, marginBottom: 4 },
  addInput: { flex: 2, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  addQtyInput: { flex: 1, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  addConfirmBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 14, marginBottom: 4 },
  addItemBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Supplier step
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  supplierCard: { borderRadius: 16, padding: 14, gap: 10 },
  supplierCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  supplierName: { fontSize: 16, fontFamily: "Inter_700Bold", flexShrink: 1 },
  supplierMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  stockCount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  supplierPrice: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bestBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  bestBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  offerBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start", marginTop: 4 },
  offerText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  viewCatalogBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 8 },
  viewCatalogText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Confirm step cards
  confirmCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  confirmCardHead: { flexDirection: "row", alignItems: "center", gap: 6, padding: 12, borderBottomWidth: 1 },
  confirmCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  confirmKey: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  confirmVal: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  changeSupplierLink: { paddingHorizontal: 14, paddingBottom: 12 },
  changeSupplierText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  editAddrBtn: { marginLeft: "auto" as any },

  // Address
  addrInput: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 60 },
  addrDisplay: { padding: 14 },
  addrText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  // Notes
  notesInput: { borderWidth: 0, padding: 14, minHeight: 60, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Mini item list
  miniItemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  miniItemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  miniItemQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  moreItems: { paddingHorizontal: 14, paddingBottom: 10, fontSize: 13, fontFamily: "Inter_400Regular" },

  // Bill card
  billCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 6 },
  billTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  billDivider: { height: 1, marginVertical: 4 },
  billTotal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  billTotalVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  billNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, fontStyle: "italic" },

  // Send
  sendBtn: { height: 62, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4 },
  sendBtnText: { color: "#FFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  sendHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Bottom bar
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  nextBtn: { height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  nextBtnText: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%", gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalCloseBtn: { height: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modalCloseBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Catalog rows
  catRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  catDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  catInfo: { flex: 1, gap: 3 },
  catName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  catOfferBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  catOfferText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  catMoq: { fontSize: 11, fontFamily: "Inter_400Regular" },
  catPriceBlock: { alignItems: "flex-end" },
  catPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  catUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  noStockLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  selectSupplierBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  selectSupplierBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
});
