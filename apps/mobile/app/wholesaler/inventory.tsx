import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiDelete, apiGet, apiPatch, apiPost, getUserHeaders } from "@/constants/api";
import { WholesalerTabBar } from "@/components/WholesalerTabBar";
import { TaxHelpButton } from "@/components/TaxHelpButton";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { confirm } from "@/utils/confirm";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";

type InventoryItem = {
  id: number;
  name: string;
  unit: string;
  pricePerUnit: number;
  stockQuantity?: number;
  taxPercent?: number;
  category?: string;
  discountType?: string;
  discountValue?: number;
  leadTime?: string;
  extraInfo?: string;
  available?: boolean;
  minOrderQty?: number;
  offer?: string;
};

const UNIT_OPTIONS = ["kg", "litre", "box", "piece", "packet"];
const CATEGORY_OPTIONS = ["Rice", "Dal", "Oil", "Spices", "Snacks", "Cleaning", "Dairy", "Other"];

function emptyDraft(): Partial<InventoryItem> {
  return {
    name: "",
    unit: "kg",
    pricePerUnit: 0,
    stockQuantity: 0,
    taxPercent: 0,
    category: "",
    discountType: "none",
    discountValue: 0,
    leadTime: "",
    extraInfo: "",
    minOrderQty: 1,
    offer: "",
    available: true,
  };
}

export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const s = useWholesalerStrings();
  const headers = useMemo(
    () => getUserHeaders(user),
    [user?.phone, user?.role, user?.wholesalerId],
  );
  const canManageInventory = user?.role === "wholesaler" && !!user?.wholesalerId;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<InventoryItem>>(emptyDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");
  const filteredItems = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;
  const lowStockItems = items.filter(i => i.stockQuantity != null && (i.stockQuantity ?? 0) > 0 && (i.stockQuantity ?? 0) < 5);
  const outOfStockItems = items.filter(i => i.stockQuantity != null && (i.stockQuantity ?? 0) <= 0);

  // Group filtered inventory by category, with "Uncategorized" last.
  const categoryOrder = ["Rice", "Dal", "Oil", "Spices", "Snacks", "Cleaning", "Dairy", "Other"];
  const groupedItems = useMemo(() => {
    const buckets = new Map<string, InventoryItem[]>();
    for (const it of filteredItems) {
      const cat = (it.category && it.category.trim()) || s("uncategorized");
      const arr = buckets.get(cat) ?? [];
      arr.push(it);
      buckets.set(cat, arr);
    }
    const entries = Array.from(buckets.entries());
    entries.sort((a, b) => {
      const ai = categoryOrder.indexOf(a[0]);
      const bi = categoryOrder.indexOf(b[0]);
      if (a[0] === s("uncategorized")) return 1;
      if (b[0] === s("uncategorized")) return -1;
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return entries;
  }, [filteredItems]);

  const goBackSafe = () => {
    if (router.canGoBack()) { router.back(); return; }
    router.replace("/wholesaler");
  };

  const load = useCallback(async () => {
    if (!canManageInventory || !headers) {
      setItems([]); setLoading(false);
      setError("Please login as a wholesaler to manage inventory.");
      return;
    }
    setLoading(true);
    try {
      setError("");
      const { inventory } = await apiGet<{ inventory: InventoryItem[] }>("/api/wholesaler/inventory", headers);
      setItems(inventory);
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory");
    } finally { setLoading(false); }
  }, [canManageInventory, headers]);

  useEffect(() => { load(); }, [load]);
  // Re-fetch every time the screen gains focus — covers coming back from
  // scan-save, from an order confirm (which decrements stock), etc.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // If we arrived here from a save flow, show a success banner.
  const params = useLocalSearchParams<{ saved?: string; merged?: string; needFix?: string }>();
  const [savedBanner, setSavedBanner] = useState<{ saved: number; merged: number; needFix: number } | null>(null);
  useEffect(() => {
    if (params.saved !== undefined) {
      setSavedBanner({
        saved: Number(params.saved) || 0,
        merged: Number(params.merged) || 0,
        needFix: Number(params.needFix) || 0,
      });
      const t = setTimeout(() => setSavedBanner(null), 6000);
      return () => clearTimeout(t);
    }
  }, [params.saved, params.merged, params.needFix]);

  const saveDraft = async () => {
    if (!draft.name?.trim()) {
      Alert.alert("Add item name", "Please type a name before adding.");
      return;
    }
    if (!canManageInventory || !headers) {
      Alert.alert("Please login as a wholesaler again.");
      return;
    }
    try {
      // Only send the columns the user can actually mutate. We were
      // previously spreading the whole draft (including id, createdAt) which
      // tripped server-side type checking and produced a 500.
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        unit: draft.unit?.trim() || "kg",
        pricePerUnit: Number(draft.pricePerUnit ?? 0) || 0,
        stockQuantity: Number(draft.stockQuantity ?? 0) || 0,
        category: draft.category ?? null,
        taxPercent: Number(draft.taxPercent ?? 0) || 0,
        minOrderQty: Number(draft.minOrderQty ?? 1) || 1,
        offer: draft.offer ?? null,
        leadTime: draft.leadTime ?? null,
        extraInfo: draft.extraInfo ?? null,
        discountType: draft.discountType ?? null,
        discountValue: Number(draft.discountValue ?? 0) || 0,
        available: draft.available ?? true,
      };
      if (editingId) {
        await apiPatch(`/api/wholesaler/inventory/${editingId}`, payload, headers);
        setEditingId(null);
      } else {
        await apiPost("/api/wholesaler/inventory", payload, headers);
      }
      setDraft(emptyDraft());
      setShowMore(false);
      await load();
    } catch (err: any) {
      Alert.alert("Could not save item", err?.message || "Please try again.");
    }
  };

  const deleteItem = async (item: InventoryItem) => {
    const ok = await confirm("Delete this item?", item.name, { okLabel: "Delete", destructive: true });
    if (!ok) return;
    if (!canManageInventory || !headers) return;
    try {
      await apiDelete(`/api/wholesaler/inventory/${item.id}`, headers);
      await load();
    } catch (err: any) {
      Alert.alert("Could not delete", err?.message || "Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackSafe}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{s("myStock")}</Text>
        <TouchableOpacity onPress={load}><Feather name="refresh-cw" size={18} color={colors.primary} /></TouchableOpacity>
      </View>

      <View style={[styles.summaryRow, { paddingHorizontal: 16, paddingTop: 12 }]}>
        <View style={[styles.summaryTile, { backgroundColor: colors.available + "14", borderColor: colors.available + "44" }]}>
          <Text style={[styles.summaryNum, { color: colors.available }]}>{items.length - outOfStockItems.length - lowStockItems.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s("plentyInStock")}</Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B55" }]}>
          <Text style={[styles.summaryNum, { color: "#92400E" }]}>{lowStockItems.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s("runningLow")}</Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: colors.unavailable + "14", borderColor: colors.unavailable + "44" }]}>
          <Text style={[styles.summaryNum, { color: colors.unavailable }]}>{outOfStockItems.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s("finished")}</Text>
        </View>
      </View>

      {savedBanner && (
        <View style={[styles.savedBanner, { backgroundColor: colors.available + "16", borderColor: colors.available + "55" }]}>
          <Feather name="check-circle" size={18} color={colors.available} />
          <Text style={[styles.savedBannerText, { color: colors.available }]}>
            {s("savedBangPrefix")}
            {savedBanner.saved > 0 ? ` ${savedBanner.saved} ${s("newWord")}` : ""}
            {savedBanner.merged > 0 ? `${savedBanner.saved > 0 ? "," : ""} ${savedBanner.merged} ${s("mergedWithExisting")}` : ""}
            {savedBanner.needFix > 0 ? `. ${savedBanner.needFix} ${s("needPriceStock")}` : "."}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.scanCta, { backgroundColor: colors.primary, marginTop: 12 }]}
        onPress={() => router.push("/wholesaler/inventory-scan" as any)}
      >
        <Feather name="camera" size={20} color="#FFF" />
        <View style={{ flex: 1 }}>
          <Text style={styles.scanCtaTitle}>{s("scanList")}</Text>
          <Text style={styles.scanCtaSub}>{s("scanListSub")}</Text>
        </View>
        <Feather name="chevron-right" size={20} color="#FFF" />
      </TouchableOpacity>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.form, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>{editingId ? s("editItem") : s("addOneItem")}</Text>

          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            placeholder={s("itemNamePh")}
            placeholderTextColor={colors.mutedForeground}
            value={String(draft.name ?? "")}
            onChangeText={(v) => setDraft((p) => ({ ...p, name: v }))}
          />

          <View style={styles.rowForm}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("unit")}</Text>
              <View style={styles.chipsRow}>
                {UNIT_OPTIONS.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: draft.unit === unit ? colors.primary + "22" : colors.card }]}
                    onPress={() => setDraft((p) => ({ ...p, unit }))}
                  >
                    <Text style={{ color: draft.unit === unit ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.rowForm}>
            <View style={styles.col}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("pricePerUnit")} {draft.unit ?? "unit"})</Text>
              <TextInput style={[styles.inputHalf, { borderColor: colors.border, color: colors.foreground }]} placeholder="0" placeholderTextColor={colors.mutedForeground} value={String(draft.pricePerUnit || "")} onChangeText={(v) => setDraft((p) => ({ ...p, pricePerUnit: Number(v) || 0 }))} keyboardType="decimal-pad" />
            </View>
            <View style={styles.col}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("stock")}{draft.unit ?? "unit"})</Text>
              <TextInput style={[styles.inputHalf, { borderColor: colors.border, color: colors.foreground }]} placeholder="0" placeholderTextColor={colors.mutedForeground} value={String(draft.stockQuantity || "")} onChangeText={(v) => setDraft((p) => ({ ...p, stockQuantity: Number(v) || 0 }))} keyboardType="decimal-pad" />
            </View>
          </View>

          <TouchableOpacity onPress={() => setShowMore((v) => !v)} style={styles.moreToggle}>
            <Feather name={showMore ? "chevron-up" : "chevron-down"} size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
              {showMore ? s("hideExtraDetails") : s("moreDetails")}
            </Text>
          </TouchableOpacity>

          {showMore && (
            <View style={{ gap: 8 }}>
              <View style={styles.rowForm}>
                <View style={styles.col}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("taxPercent")}</Text>
                    <TaxHelpButton />
                  </View>
                  <TextInput style={[styles.inputHalf, { borderColor: colors.border, color: colors.foreground }]} placeholder="0" placeholderTextColor={colors.mutedForeground} value={String(draft.taxPercent ?? "")} onChangeText={(v) => setDraft((p) => ({ ...p, taxPercent: Number(v) || 0 }))} keyboardType="decimal-pad" />
                </View>
                <View style={styles.col}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                    {s("minOrderQty")} ({draft.unit ?? "unit"})
                  </Text>
                  <TextInput style={[styles.inputHalf, { borderColor: colors.border, color: colors.foreground }]} placeholder="1" placeholderTextColor={colors.mutedForeground} value={String(draft.minOrderQty ?? 1)} onChangeText={(v) => setDraft((p) => ({ ...p, minOrderQty: Number(v) || 1 }))} keyboardType="decimal-pad" />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("category")}</Text>
              <View style={styles.chipsRow}>
                {CATEGORY_OPTIONS.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: draft.category === category ? colors.primary + "22" : colors.card }]}
                    onPress={() => setDraft((p) => ({ ...p, category }))}
                  >
                    <Text style={{ color: draft.category === category ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder={s("offer")} placeholderTextColor={colors.mutedForeground} value={String(draft.offer ?? "")} onChangeText={(v) => setDraft((p) => ({ ...p, offer: v }))} />
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder={s("leadTime")} placeholderTextColor={colors.mutedForeground} value={String(draft.leadTime ?? "")} onChangeText={(v) => setDraft((p) => ({ ...p, leadTime: v }))} />
              <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} placeholder={s("notesForKirana")} placeholderTextColor={colors.mutedForeground} value={String(draft.extraInfo ?? "")} onChangeText={(v) => setDraft((p) => ({ ...p, extraInfo: v }))} />
            </View>
          )}

          <View style={styles.rowForm}>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={saveDraft}>
              <Text style={styles.addText}>{editingId ? s("save") : s("addToStock")}</Text>
            </TouchableOpacity>
            {editingId && (
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setEditingId(null); setDraft(emptyDraft()); setShowMore(false); }}>
                <Text style={{ color: colors.foreground }}>{s("cancel")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}

        <Text style={[styles.listTitle, { color: colors.foreground }]}>
          {s("myItems")} {items.length ? `(${items.length})` : ""}
        </Text>
        {items.length > 5 && (
          <TextInput
            style={[styles.searchInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder={s("searchItems")}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
          />
        )}

        {loading ? <ActivityIndicator color={colors.primary} /> : items.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="package" size={28} color={colors.mutedForeground} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{s("noItemsYet")}</Text>
            <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 13 }}>
              {s("noItemsHint")}
            </Text>
          </View>
        ) : groupedItems.map(([category, list]) => (
          <View key={category} style={{ gap: 6 }}>
            <Text style={[styles.categoryHeader, { color: colors.mutedForeground }]}>
              {category}  ·  {list.length}
            </Text>
            {list.map((item) => {
              const stock = item.stockQuantity ?? 0;
              const isLow = stock <= (item.minOrderQty ?? 3) && stock > 0;
              const isOut = stock === 0;
              const stockColor = isOut ? colors.destructive : isLow ? "#D97706" : colors.available;
              return (
                <View key={item.id} style={[styles.row, { borderColor: isOut ? colors.destructive + "55" : isLow ? "#F59E0B55" : colors.border, backgroundColor: colors.card }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      ₹{item.pricePerUnit}/{item.unit}{(item.taxPercent ?? 0) > 0 ? `  ·  tax ${item.taxPercent}%` : ""}
                    </Text>
                    {!!item.offer && <Text style={{ color: colors.available, fontSize: 12, marginTop: 2 }}>{item.offer}</Text>}
                  </View>
                  {/* Quick stock +/- */}
                  <View style={styles.quickEdit}>
                    <TouchableOpacity
                      style={[styles.qBtn, { borderColor: colors.border }]}
                      onPress={async () => {
                        const newQty = Math.max(0, stock - 1);
                        setItems(prev => prev.map(i => i.id === item.id ? { ...i, stockQuantity: newQty } : i));
                        try {
                          const h = getUserHeaders(user!);
                          await apiPatch(`/api/wholesaler/inventory/${item.id}`, { stockQuantity: newQty }, h);
                        } catch {
                          setItems(prev => prev.map(i => i.id === item.id ? { ...i, stockQuantity: stock } : i));
                        }
                      }}
                    >
                      <Feather name="minus" size={14} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={[styles.qStock, { color: stockColor }]}>{stock}</Text>
                    <TouchableOpacity
                      style={[styles.qBtn, { borderColor: colors.border }]}
                      onPress={async () => {
                        const newQty = stock + 1;
                        setItems(prev => prev.map(i => i.id === item.id ? { ...i, stockQuantity: newQty } : i));
                        try {
                          const h = getUserHeaders(user!);
                          await apiPatch(`/api/wholesaler/inventory/${item.id}`, { stockQuantity: newQty }, h);
                        } catch {
                          setItems(prev => prev.map(i => i.id === item.id ? { ...i, stockQuantity: stock } : i));
                        }
                      }}
                    >
                      <Feather name="plus" size={14} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => { setEditingId(item.id); setDraft(item); setShowMore(true); }}>
                    <Feather name="edit-2" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item)}>
                    <Feather name="trash-2" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <WholesalerTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scanCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, marginHorizontal: 16, marginBottom: 12 },
  scanCtaTitle: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  scanCtaSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_400Regular" },
  form: { gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  formTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  rowForm: { flexDirection: "row", gap: 8 },
  col: { flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Inter_500Medium" },
  inputHalf: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Inter_500Medium" },
  moreToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  addBtn: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancelBtn: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, paddingHorizontal: 18 },
  addText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  listTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 6 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryTile: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  summaryNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  searchInput: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  savedBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10, marginHorizontal: 16 },
  savedBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  categoryHeader: { fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 10, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.6 },
  emptyBox: { alignItems: "center", gap: 6, padding: 24, borderRadius: 14, borderWidth: 1, borderStyle: "dashed" },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  quickEdit: { flexDirection: "row", alignItems: "center", gap: 6 },
  qBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qStock: { fontSize: 14, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
});
