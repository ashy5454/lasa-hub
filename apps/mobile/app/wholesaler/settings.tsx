import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPatch, getUserHeaders } from "@/constants/api";
import { WholesalerTabBar } from "@/components/WholesalerTabBar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useWholesalerStrings } from "@/hooks/useWholesalerStrings";
import { LasaLogo } from "@/components/LasaLogo";

type Settings = {
  id: string;
  name: string;
  ownerName: string;
  location: string;
  gstin?: string | null;
  fssai?: string | null;
  verified?: boolean;
  defaultTaxPercent?: number;
  defaultDiscountPercent?: number;
  defaultDeliveryTime?: string | null;
  fromAddress?: string | null;
  specialOffer?: string | null;
};

const DELIVERY_PRESETS = ["Tomorrow 9 AM", "Tomorrow 5 PM", "Day after 9 AM", "Within 2 hours"];

export default function WholesalerSettings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const s = useWholesalerStrings();
  const headers = useMemo(() => getUserHeaders(user), [user?.phone, user?.role, user?.wholesalerId]);

  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    if (!headers || user?.role !== "wholesaler") {
      setLoading(false);
      setError("Please login as a wholesaler.");
      return;
    }
    try {
      setLoading(true); setError("");
      const { settings } = await apiGet<{ settings: Settings }>("/api/wholesaler/settings", headers);
      setSettings(settings ?? {});
    } catch (err: any) {
      setError(err?.message || "Failed to load settings");
    } finally { setLoading(false); }
  }, [headers, user?.role]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!headers) return;
    setSaving(true);
    try {
      const { settings: server } = await apiPatch<{ settings: any }>("/api/wholesaler/settings", settings, headers);
      // Pull the canonical record back into local state so we never display
      // the unsaved draft after the user navigates away and back.
      setSettings(server ?? settings);
      // Refresh the cached user record so the dashboard header picks up
      // any shop-name change without a relog.
      await refreshUser();
      // Use an inline banner instead of Alert — Alert.alert disappears
      // too quickly on web and the user thinks the save didn't happen.
      setSavedAt(Date.now());
    } catch (err: any) {
      Alert.alert("Could not save", err?.message || "Please try again.");
    } finally { setSaving(false); }
  };

  // Dismiss the saved banner after 6 seconds
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 6000);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace("/wholesaler" as any)} style={{ padding: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{s("shopSettings")}</Text>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </View>

      <WholesalerTabBar />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
          {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
          {savedAt && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: colors.available + "16", borderColor: colors.available + "55" }}>
              <Feather name="check-circle" size={18} color={colors.available} />
              <Text style={{ color: colors.available, fontFamily: "Inter_600SemiBold", flex: 1 }}>
                {settings.gstin || settings.fssai
                  ? "Saved. Admin will verify your GSTIN/FSSAI — you'll get a badge once approved."
                  : "Saved."}
              </Text>
            </View>
          )}

          <View style={[styles.verifyBadge, { backgroundColor: settings.verified ? colors.available + "18" : "#FEF3C7", borderColor: settings.verified ? colors.available : "#F59E0B" }]}>
            <Feather name={settings.verified ? "shield" : "alert-triangle"} size={18} color={settings.verified ? colors.available : "#92400E"} />
            <Text style={{ color: settings.verified ? colors.available : "#92400E", fontFamily: "Inter_600SemiBold", flex: 1 }}>
              {settings.verified ? s("verifiedShop") : s("notVerifiedYet")}
            </Text>
          </View>

          <Section title={s("shop")}>
            <Field label={s("shopName")} value={settings.name ?? ""} onChange={(v) => setSettings((p) => ({ ...p, name: v }))} colors={colors} />
            <Field label={s("ownerName")} value={settings.ownerName ?? ""} onChange={(v) => setSettings((p) => ({ ...p, ownerName: v }))} colors={colors} />
            <Field label={s("shopLocation")} value={settings.location ?? ""} onChange={(v) => setSettings((p) => ({ ...p, location: v }))} colors={colors} />
            <Field label={s("pickupAddress")} value={settings.fromAddress ?? ""} onChange={(v) => setSettings((p) => ({ ...p, fromAddress: v }))} multiline colors={colors} />
          </Section>

          <Section title={s("identity")}>
            <Field label={s("gstin")} value={settings.gstin ?? ""} onChange={(v) => setSettings((p) => ({ ...p, gstin: v.toUpperCase() }))} colors={colors} />
            <Field label={s("fssaiNumber")} value={settings.fssai ?? ""} onChange={(v) => setSettings((p) => ({ ...p, fssai: v }))} colors={colors} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {s("adminVerifies")}
            </Text>
          </Section>

          <Section title={s("orderDefaults")}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("defaultTaxPct")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={String(settings.defaultTaxPercent ?? "")}
                  onChangeText={(v) => setSettings((p) => ({ ...p, defaultTaxPercent: Number(v) || 0 }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("defaultDiscount")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={String(settings.defaultDiscountPercent ?? "")}
                  onChangeText={(v) => setSettings((p) => ({ ...p, defaultDiscountPercent: Number(v) || 0 }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{s("defaultDelivery")}</Text>
            <View style={styles.chipsRow}>
              {DELIVERY_PRESETS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: settings.defaultDeliveryTime === t ? colors.primary + "22" : colors.card }]}
                  onPress={() => setSettings((p) => ({ ...p, defaultDeliveryTime: t }))}
                >
                  <Text style={{ color: settings.defaultDeliveryTime === t ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              value={settings.defaultDeliveryTime ?? ""}
              onChangeText={(v) => setSettings((p) => ({ ...p, defaultDeliveryTime: v }))}
              placeholder={s("orTypeCustom")}
              placeholderTextColor={colors.mutedForeground}
            />
          </Section>

          <Section title={s("promotions")}>
            <Field label={s("banner")} value={settings.specialOffer ?? ""} onChange={(v) => setSettings((p) => ({ ...p, specialOffer: v }))} colors={colors} />
          </Section>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{s("saveSettings")}</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={[styles.sectionBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {children}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, multiline, colors }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; colors: any }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[multiline ? styles.multiline : styles.input, { borderColor: colors.border, color: colors.foreground }]}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 16 },
  verifyBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Inter_500Medium" },
  multiline: { borderWidth: 1, borderRadius: 10, padding: 12, fontFamily: "Inter_400Regular", minHeight: 70 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  saveBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 15 },
});
