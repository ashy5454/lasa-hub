import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost, getUserHeaders } from "@/constants/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { pickName } from "@/data/wholesalers";
import { SampleListCard } from "@/components/SampleListCard";
import { TaxHelpButton } from "@/components/TaxHelpButton";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";
import { LasaLogo } from "@/components/LasaLogo";

type Draft = {
  name: string;
  nameTe: string;
  nameHi: string;
  unit: string;
  pricePerUnit: number;
  stockQuantity: number;
  taxPercent: number;
};

const UNIT_OPTIONS = ["kg", "litre", "box", "piece", "packet"];

async function imageUriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const match = result.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) { reject(new Error("Invalid base64")); return; }
        resolve({ base64: match[2], mimeType: match[1] });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    const { default: FileSystem } = await import("expo-file-system" as any);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return { base64, mimeType: "image/jpeg" };
  }
}

export default function InventoryScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { language } = useLanguage();
  const s = useWholesalerStrings();
  const headers = useMemo(() => getUserHeaders(user), [user?.phone, user?.role, user?.wholesalerId]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickImage = async (fromCamera: boolean) => {
    try {
      const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await fn({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, base64: false });
      if (!result.canceled && result.assets?.[0]) {
        const uri = result.assets[0].uri;
        setImageUri(uri); setRows(null); setError(null);
        analyze(uri);
      }
    } catch (err) {
      console.warn("ImagePicker error:", err);
      setError("Camera error. Please try again.");
    }
  };

  const analyze = async (uri: string) => {
    setIsAnalyzing(true); setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { base64, mimeType } = await imageUriToBase64(uri);
      const result = await apiPost<{ items: any[] }>("/api/ai/analyze-inventory", { imageBase64: base64, mimeType });
      if (Array.isArray(result.items) && result.items.length > 0) {
        const drafts: Draft[] = result.items.map((i: any) => ({
          name: String(i.name ?? "Item").trim(),
          nameTe: String(i.nameTe ?? ""),
          nameHi: String(i.nameHi ?? ""),
          unit: UNIT_OPTIONS.includes(String(i.unit)) ? String(i.unit) : "kg",
          pricePerUnit: Number(i.pricePerUnit) || 0,
          stockQuantity: Number(i.stockQuantity) || 0,
          taxPercent: Number(i.taxPercent) || 0,
        }));
        setRows(drafts);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error("No items detected");
      }
    } catch (err: any) {
      setError(err?.message || "Could not read the photo. Try a clearer one.");
      setRows([]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<Draft>) => {
    setRows((prev) => prev?.map((r, i) => (i === idx ? { ...r, ...patch } : r)) ?? null);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev?.filter((_, i) => i !== idx) ?? null);
  };

  const addRow = () => {
    setRows((prev) => [...(prev ?? []), { name: "", nameTe: "", nameHi: "", unit: "kg", pricePerUnit: 0, stockQuantity: 0, taxPercent: 0 }]);
  };

  const saveAll = async () => {
    if (!rows?.length) return;
    if (!headers) {
      Alert.alert("Login required", "Please login as a wholesaler.");
      return;
    }
    // A row is saveable if it has SOME name in any language. Missing
    // price / stock is fine — the wholesaler can fill those in later
    // from My Stock and we just hide the item from kiranas until they do.
    const valid = rows
      .filter((r) => r.name.trim() || r.nameTe.trim() || r.nameHi.trim())
      .map((r) => ({
        ...r,
        name: r.name.trim() || r.nameTe.trim() || r.nameHi.trim(),
      }));
    if (!valid.length) return; // button shouldn't be enabled anyway
    setSaving(true);
    try {
      const resp = await apiPost<{ count: number; newCount?: number; mergedCount?: number; items?: any[] }>(
        "/api/wholesaler/inventory/bulk",
        { items: valid },
        headers,
      );
      const newCount = resp.newCount ?? resp.count ?? 0;
      const mergedCount = resp.mergedCount ?? 0;
      const needFix = (resp.items ?? []).filter((i) => !i.available).length;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/wholesaler/inventory?saved=${newCount}&merged=${mergedCount}&needFix=${needFix}` as any);
    } catch (err: any) {
      console.warn("Bulk save failed:", err);
      Alert.alert("Could not save", err?.message || "Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // For the save button label/disabled state.
  const saveableCount = (rows ?? []).filter(
    (r) => r.name.trim() || r.nameTe.trim() || r.nameHi.trim(),
  ).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Scan price list</Text>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        {!imageUri ? (
          <View style={{ gap: 14 }}>
            <SampleListCard variant="inventory" />
            <View style={[styles.previewBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Feather name="camera" size={64} color={colors.primary} />
              <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                Take a clear photo of your handwritten price/stock list
              </Text>
            </View>
            <View style={[styles.tipsBox, { backgroundColor: colors.primary + "0e", borderColor: colors.primary + "33" }]}>
              <Text style={[styles.tipsTitle, { color: colors.foreground }]}>For best results</Text>
              <Text style={[styles.tipsLine, { color: colors.mutedForeground }]}>• White paper, dark pen</Text>
              <Text style={[styles.tipsLine, { color: colors.mutedForeground }]}>• One item per line: name, unit, price, stock</Text>
              <Text style={[styles.tipsLine, { color: colors.mutedForeground }]}>• Hold phone flat, good light</Text>
              <Text style={[styles.tipsLine, { color: colors.mutedForeground }]}>• You can fix any row after we read it</Text>
            </View>
            <TouchableOpacity style={[styles.cameraBtn, { backgroundColor: colors.primary }]} onPress={() => pickImage(true)}>
              <Feather name="camera" size={22} color="#FFF" />
              <Text style={styles.cameraBtnText}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.galleryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]} onPress={() => pickImage(false)}>
              <Feather name="image" size={20} color={colors.accent} />
              <Text style={[styles.galleryBtnText, { color: colors.accent }]}>Choose from gallery</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
            {isAnalyzing ? (
              <View style={[styles.analyzingBox, { backgroundColor: colors.secondary }]}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.analyzingText, { color: colors.foreground }]}>Reading your list…</Text>
              </View>
            ) : rows ? (
              <View style={{ gap: 10 }}>
                {error && (
                  <View style={[styles.errBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                    <Feather name="alert-triangle" size={16} color="#92400E" />
                    <Text style={styles.errBoxText}>{error}</Text>
                  </View>
                )}
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {rows.length} item{rows.length !== 1 ? "s" : ""} — edit before saving
                </Text>

                {rows.map((row, i) => {
                  // Show the wholesaler's preferred language variant in the name
                  // input; English canonical stays underneath as a hint so they
                  // can confirm the OCR mapped to the right item.
                  const inputValue = pickName(row, language);
                  const hasName = !!(row.name.trim() || row.nameTe.trim() || row.nameHi.trim());
                  const missing: string[] = [];
                  if (!hasName) missing.push("name");
                  if (!(row.pricePerUnit > 0)) missing.push("price");
                  if (!(row.stockQuantity > 0)) missing.push("stock");
                  return (
                  <View key={i} style={[styles.rowCard, {
                    backgroundColor: colors.card,
                    borderColor: missing.length === 0 ? colors.available + "80" : missing.includes("name") ? colors.unavailable + "55" : "#F59E0B55",
                  }]}>
                    {missing.length > 0 && (
                      <View style={[styles.missingChip, {
                        backgroundColor: missing.includes("name") ? colors.unavailable + "14" : "#FEF3C7",
                        borderColor: missing.includes("name") ? colors.unavailable + "55" : "#F59E0B55",
                      }]}>
                        <Feather name="alert-triangle" size={12} color={missing.includes("name") ? colors.unavailable : "#92400E"} />
                        <Text style={[styles.missingChipText, { color: missing.includes("name") ? colors.unavailable : "#92400E" }]}>
                          Add {missing.join(" + ")} below
                        </Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          style={[styles.inputName, { borderColor: colors.border, color: colors.foreground }]}
                          placeholder="Item name"
                          placeholderTextColor={colors.mutedForeground}
                          value={inputValue}
                          onChangeText={(v) => {
                            // Edit whichever language variant is currently displayed.
                            if (language === "te") updateRow(i, { nameTe: v });
                            else if (language === "hi") updateRow(i, { nameHi: v });
                            else updateRow(i, { name: v });
                          }}
                        />
                        {language !== "en" && row.name && row.name !== inputValue && (
                          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 3 }}>
                            ({row.name})
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => removeRow(i)} style={{ alignSelf: "center", padding: 8 }}>
                        <Feather name="trash-2" size={18} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.chipsRow}>
                      {UNIT_OPTIONS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          style={[styles.chip, { borderColor: colors.border, backgroundColor: row.unit === u ? colors.primary + "22" : colors.card }]}
                          onPress={() => updateRow(i, { unit: u })}
                        >
                          <Text style={{ color: row.unit === u ? colors.primary : colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Price (₹/{row.unit})</Text>
                        <TextInput
                          style={[styles.inputSmall, { borderColor: colors.border, color: colors.foreground }]}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          value={String(row.pricePerUnit || "")}
                          onChangeText={(v) => updateRow(i, { pricePerUnit: Number(v) || 0 })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Stock ({row.unit})</Text>
                        <TextInput
                          style={[styles.inputSmall, { borderColor: colors.border, color: colors.foreground }]}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          value={String(row.stockQuantity || "")}
                          onChangeText={(v) => updateRow(i, { stockQuantity: Number(v) || 0 })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Tax %</Text>
                          <TaxHelpButton size={14} />
                        </View>
                        <TextInput
                          style={[styles.inputSmall, { borderColor: colors.border, color: colors.foreground }]}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          value={String(row.taxPercent || "")}
                          onChangeText={(v) => updateRow(i, { taxPercent: Number(v) || 0 })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  </View>
                  );
                })}

                <TouchableOpacity style={[styles.addRowBtn, { borderColor: colors.primary }]} onPress={addRow}>
                  <Feather name="plus" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Add another row</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving || saveableCount === 0 ? 0.5 : 1 }]}
                  onPress={saveAll}
                  disabled={saving || saveableCount === 0}
                >
                  {saving ? <ActivityIndicator color="#FFF" /> : (
                    <>
                      <Feather name="check" size={20} color="#FFF" />
                      <Text style={styles.saveBtnText}>
                        {saveableCount === 0 ? s("addNameToSave") : `${s("save")} ${saveableCount}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  {s("rowsMissingHint")}
                </Text>

                <TouchableOpacity onPress={() => { setImageUri(null); setRows(null); setError(null); }} style={{ alignItems: "center", paddingVertical: 8 }}>
                  <Text style={{ color: colors.mutedForeground }}>Retake photo</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 12 },
  previewBox: { height: 220, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 },
  previewHint: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  previewSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  tipsBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  tipsTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 4 },
  tipsLine: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cameraBtn: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  cameraBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  galleryBtn: { height: 50, borderRadius: 14, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  galleryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  image: { width: "100%", height: 200, borderRadius: 14 },
  analyzingBox: { borderRadius: 14, padding: 22, alignItems: "center", gap: 10 },
  analyzingText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  errBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12 },
  errBoxText: { flex: 1, fontSize: 12, color: "#92400E" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  rowCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  inputName: { flex: 1, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  inputSmall: { height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontFamily: "Inter_500Medium", fontSize: 14 },
  colLabel: { fontSize: 11, marginBottom: 4 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  addRowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12 },
  saveBtn: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  saveBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  missingChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  missingChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
