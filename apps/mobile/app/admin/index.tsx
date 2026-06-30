import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/constants/api";
import { useColors } from "@/hooks/useColors";
import { confirm } from "@/utils/confirm";

type Tab = "overview" | "wholesalers" | "catalog" | "orders" | "users";

interface Wholesaler {
  id: string; name: string; ownerName: string; ownerPhone: string;
  location: string; distance: string; rating: number;
  specialOffer: string | null; active: boolean;
  lat?: number; lng?: number;
  gstin?: string | null;
  fssai?: string | null;
  verified?: boolean;
  defaultTaxPercent?: number;
  defaultDiscountPercent?: number;
  orderCount?: number;
  revenue?: number;
}
interface CatalogItem {
  id: number; wholesalerId: string; name: string;
  nameTe: string; nameHi: string;
  unit: string; pricePerUnit: number;
  available: boolean; minOrderQty: number;
  offer: string | null;
}
interface Order {
  id: string; shopName: string; kiranaName: string; kiranaPhone: string;
  wholesalerId: string; status: string;
  totalAmount: number | null; createdAt: string;
  deliveryAddress?: string | null;
  items: { name: string; quantity: string; available: boolean }[];
}
interface UserRow {
  phone: string; role: string; name: string;
  shopName: string; language: string; createdAt: string;
  wholesalerId?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  verified?: boolean;
}
interface UserDrilldown {
  user: UserRow;
  history: Order[];
}

const TOKEN_KEY = "lasa_admin_token";

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
    })();
  }, []);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const handleLogin = async () => {
    setLoginError("");
    setLoading(true);
    try {
      await apiPost("/api/admin/login", { token: tokenInput });
      await AsyncStorage.setItem(TOKEN_KEY, tokenInput);
      setToken(tokenInput);
    } catch (err: any) {
      setLoginError(err?.message || "Invalid token");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null); setTokenInput(""); setTab("overview");
  };

  if (!token) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>
        <View style={styles.loginBox}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <Feather name="shield" size={28} color="#FFF" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Admin Login</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Paste the ADMIN_TOKEN from your server .env
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="admin token"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loginError ? <Text style={[styles.err, { color: colors.destructive }]}>{loginError}</Text> : null}
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.replace("/")}>
            <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Back to app</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 12), backgroundColor: colors.primary }]}>
        <Text style={styles.topBarTitle}>Lasa Hub — Admin</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.topBarBtn}>
          <Feather name="log-out" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
        {(["overview", "wholesalers", "catalog", "orders", "users"] as Tab[]).map(key => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && { borderBottomColor: colors.primary }]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, { color: tab === key ? colors.primary : colors.mutedForeground }]}>{key}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {tab === "overview" && <Overview authHeaders={authHeaders} />}
        {tab === "wholesalers" && <WholesalersPane authHeaders={authHeaders} />}
        {tab === "catalog" && <CatalogPane authHeaders={authHeaders} />}
        {tab === "orders" && <OrdersPane authHeaders={authHeaders} />}
        {tab === "users" && <UsersPane authHeaders={authHeaders} />}
      </ScrollView>
    </View>
  );
}

/* ---------------------------------- OVERVIEW --------------------------------- */
function Overview({ authHeaders }: { authHeaders?: Record<string, string> }) {
  const colors = useColors();
  const [stats, setStats] = useState<{ users: number; wholesalers: number; orders: number; pending: number; pendingVerification?: number } | null>(null);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [error, setError] = useState<string>("");
  const reload = useCallback(() => {
    apiGet("/api/admin/stats", authHeaders)
      .then(setStats)
      .catch((err: any) => setError(err?.message || "Failed to load stats"));
    apiGet<{ wholesalers: any[] }>("/api/admin/pending-verifications", authHeaders)
      .then(r => setPendingList(r.wholesalers ?? []))
      .catch(() => {});
  }, [authHeaders]);
  useEffect(() => { reload(); }, [reload]);

  const tiles = [
    { label: "Users", value: stats?.users ?? "-", tone: "default" as const },
    { label: "Wholesalers", value: stats?.wholesalers ?? "-", tone: "default" as const },
    { label: "Orders", value: stats?.orders ?? "-", tone: "default" as const },
    { label: "Pending orders", value: stats?.pending ?? "-", tone: "default" as const },
    { label: "Pending verifications", value: stats?.pendingVerification ?? 0, tone: ((stats?.pendingVerification ?? 0) > 0 ? "warn" : "default") as "warn" | "default" },
  ];

  const verifyWholesaler = async (id: string) => {
    try {
      await apiPatch(`/api/admin/wholesalers/${encodeURIComponent(id)}`, { verified: true }, authHeaders);
      reload();
    } catch (err: any) {
      Alert.alert("Could not verify", err?.message || "Try again.");
    }
  };

  return (
    <View style={{ gap: 14 }}>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {tiles.map(t => (
          <View
            key={t.label}
            style={[
              styles.tile,
              {
                backgroundColor: t.tone === "warn" && (t.value as number) > 0 ? "#FEF3C7" : colors.card,
                borderColor: t.tone === "warn" && (t.value as number) > 0 ? "#F59E0B" : colors.border,
              },
            ]}
          >
            <Text style={[styles.tileValue, { color: t.tone === "warn" && (t.value as number) > 0 ? "#92400E" : colors.primary }]}>{String(t.value)}</Text>
            <Text style={[styles.tileLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
          </View>
        ))}
      </View>

      {pendingList.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
            Verification queue ({pendingList.length})
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            Wholesalers who submitted their GSTIN/FSSAI. Verify after checking the document.
          </Text>
          {pendingList.map((w: any) => (
            <View key={w.id} style={[styles.row, { backgroundColor: colors.card, borderColor: "#F59E0B66" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>{w.name}</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  {w.ownerName} · +91 {w.ownerPhone}
                </Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  GSTIN: {w.gstin || "—"}  ·  FSSAI: {w.fssai || "—"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => verifyWholesaler(w.id)}
                style={[styles.addBtn, { backgroundColor: colors.available }]}
              >
                <Feather name="shield" size={14} color="#FFF" />
                <Text style={styles.addBtnText}>Verify</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* -------------------------------- WHOLESALERS -------------------------------- */
function WholesalersPane({ authHeaders }: { authHeaders?: Record<string, string> }) {
  const colors = useColors();
  const [rows, setRows] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Wholesaler> | null>(null);
  const [error, setError] = useState("");
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const filteredRows = unverifiedOnly ? rows.filter(r => !r.verified) : rows;

  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const { wholesalers } = await apiGet<{ wholesalers: Wholesaler[] }>("/api/admin/wholesalers", authHeaders);
      setRows(wholesalers);
    } catch (err: any) {
      setError(err?.message || "Failed to load wholesalers");
    } finally { setLoading(false); }
  }, [authHeaders]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id && rows.some(r => r.id === editing.id)) {
        await apiPatch(`/api/admin/wholesalers/${encodeURIComponent(editing.id)}`, editing as any, authHeaders);
      } else {
        await apiPost("/api/admin/wholesalers", editing as any, authHeaders);
      }
      setEditing(null);
      load();
    } catch (err: any) {
      Alert.alert("Save failed", err?.message || "Unknown error");
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm(
      "Delete this wholesaler?",
      "This will also delete all of their orders, catalog items, and detach any owner accounts. Cannot be undone.",
      { okLabel: "Delete", destructive: true },
    );
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/wholesalers/${encodeURIComponent(id)}`, authHeaders);
      load();
    } catch (err: any) { Alert.alert("Delete failed", err?.message || "Unknown error"); }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.paneHeader}>
        <Text style={[styles.paneTitle, { color: colors.foreground }]}>Wholesalers ({rows.length})</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setEditing({ id: "", name: "", ownerName: "", ownerPhone: "", location: "", distance: "", rating: 4.5, specialOffer: "", active: true })}
        >
          <Feather name="plus" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={() => setUnverifiedOnly((v) => !v)} style={[styles.filterChip, { borderColor: unverifiedOnly ? colors.destructive : colors.border, backgroundColor: unverifiedOnly ? colors.destructive + "18" : colors.card }]}>
          <Feather name="alert-triangle" size={12} color={unverifiedOnly ? colors.destructive : colors.mutedForeground} />
          <Text style={{ color: unverifiedOnly ? colors.destructive : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Unverified only</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : filteredRows.map(w => (
        <View key={w.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>{w.name}</Text>
              {w.verified && <Feather name="shield" size={14} color={colors.available} />}
              {!w.active && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>(paused)</Text>}
            </View>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{w.ownerName} · +91 {w.ownerPhone}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{w.location}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              GSTIN: {w.gstin || "—"}  ·  FSSAI: {w.fssai || "—"}
            </Text>
            <Text style={[styles.rowSub, { color: colors.foreground, marginTop: 2 }]}>
              {w.orderCount ?? 0} orders  ·  ₹{Math.round(w.revenue ?? 0)} revenue
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditing(w)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity onPress={() => remove(w.id)} style={styles.iconBtn}><Feather name="trash-2" size={16} color={colors.destructive} /></TouchableOpacity>
        </View>
      ))}

      <Modal visible={!!editing} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.background }]} contentContainerStyle={{ gap: 10 }}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {rows.some(r => r.id === editing?.id) ? "Edit" : "Add"} wholesaler
            </Text>
            {[
              { k: "id", label: "ID (e.g. w004)" },
              { k: "name", label: "Shop name" },
              { k: "ownerName", label: "Owner name" },
              { k: "ownerPhone", label: "Owner phone (10 digits, no +91)" },
              { k: "location", label: "Location" },
              { k: "distance", label: "Distance (e.g. 2.5 km)" },
              { k: "lat", label: "Latitude (e.g. 16.5062)", num: true },
              { k: "lng", label: "Longitude (e.g. 80.6480)", num: true },
              { k: "specialOffer", label: "Special offer (optional)" },
              { k: "gstin", label: "GSTIN" },
              { k: "fssai", label: "FSSAI license" },
              { k: "defaultTaxPercent", label: "Default tax %", num: true },
              { k: "defaultDiscountPercent", label: "Default discount %", num: true },
            ].map(f => (
              <TextInput
                key={f.k}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder={f.label}
                placeholderTextColor={colors.mutedForeground}
                value={String((editing?.[f.k as keyof Wholesaler] as any) ?? "")}
                onChangeText={v => setEditing(e => ({ ...e!, [f.k]: f.num ? (Number(v) || undefined) : v }))}
                keyboardType={f.num ? "decimal-pad" : "default"}
                autoCapitalize="none"
              />
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
              <Text style={{ color: colors.foreground, flex: 1 }}>Active</Text>
              <Switch value={editing?.active !== false} onValueChange={v => setEditing(e => ({ ...e!, active: v }))} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
              <Text style={{ color: colors.foreground, flex: 1 }}>Verified (GSTIN/FSSAI checked)</Text>
              <Switch value={!!editing?.verified} onValueChange={v => setEditing(e => ({ ...e!, verified: v }))} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={save}>
                <Text style={styles.primaryBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setEditing(null)}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/* ---------------------------------- CATALOG ---------------------------------- */
function CatalogPane({ authHeaders }: { authHeaders?: Record<string, string> }) {
  const colors = useColors();
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CatalogItem> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<{ wholesalers: Wholesaler[] }>("/api/admin/wholesalers", authHeaders)
      .then(r => {
        setWholesalers(r.wholesalers);
        if (!selectedId && r.wholesalers.length) setSelectedId(r.wholesalers[0].id);
      })
      .catch((err: any) => setError(err?.message || "Failed to load wholesalers"));
  }, [authHeaders, selectedId]);

  const loadCatalog = useCallback(async (id: string) => {
    try {
      setError("");
      setLoading(true);
      const { catalog } = await apiGet<{ catalog: CatalogItem[] }>(`/api/admin/wholesalers/${encodeURIComponent(id)}/catalog`, authHeaders);
      setItems(catalog);
    } catch (err: any) {
      setError(err?.message || "Failed to load catalog");
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { if (selectedId) loadCatalog(selectedId); }, [selectedId, loadCatalog]);

  const save = async () => {
    if (!editing || !selectedId) return;
    try {
      if (editing.id) {
        await apiPatch(`/api/admin/catalog/${editing.id}`, editing as any, authHeaders);
      } else {
        await apiPost(`/api/admin/wholesalers/${encodeURIComponent(selectedId)}/catalog`, editing as any, authHeaders);
      }
      setEditing(null);
      loadCatalog(selectedId);
    } catch (err: any) { Alert.alert("Save failed", err?.message || "Unknown error"); }
  };

  const remove = async (id: number) => {
    const ok = await confirm("Delete this catalog item?", undefined, { okLabel: "Delete", destructive: true });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/catalog/${id}`, authHeaders);
      if (selectedId) loadCatalog(selectedId);
    } catch (err: any) { Alert.alert("Delete failed", err?.message || "Unknown error"); }
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {wholesalers.map(w => (
          <Pressable
            key={w.id}
            style={[styles.pill, { borderColor: selectedId === w.id ? colors.primary : colors.border, backgroundColor: selectedId === w.id ? colors.primary + "18" : colors.card }]}
            onPress={() => setSelectedId(w.id)}
          >
            <Text style={{ color: selectedId === w.id ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold" }}>{w.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.paneHeader}>
        <Text style={[styles.paneTitle, { color: colors.foreground }]}>Items ({items.length})</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setEditing({ name: "", nameTe: "", nameHi: "", unit: "kg", pricePerUnit: 0, available: true, minOrderQty: 1, offer: "" })}
          disabled={!selectedId}
        >
          <Feather name="plus" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>Item</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}

      {loading ? <ActivityIndicator color={colors.primary} /> : items.map(it => (
        <View key={it.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.dot, { backgroundColor: it.available ? colors.available : colors.unavailable }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{it.name}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              ₹{it.pricePerUnit} / {it.unit} · MOQ {it.minOrderQty}{it.offer ? ` · ${it.offer}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditing(it)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity onPress={() => remove(it.id)} style={styles.iconBtn}><Feather name="trash-2" size={16} color={colors.destructive} /></TouchableOpacity>
        </View>
      ))}

      <Modal visible={!!editing} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editing?.id ? "Edit" : "Add"} item</Text>
            {[
              { k: "name", label: "Name (English)" },
              { k: "nameTe", label: "Name (Telugu)" },
              { k: "nameHi", label: "Name (Hindi)" },
              { k: "unit", label: "Unit (kg, litre, box, piece)" },
              { k: "pricePerUnit", label: "Price per unit (₹)", num: true },
              { k: "minOrderQty", label: "Minimum order qty", num: true },
              { k: "offer", label: "Offer (optional)" },
            ].map(f => (
              <TextInput
                key={f.k}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder={f.label}
                placeholderTextColor={colors.mutedForeground}
                value={String((editing?.[f.k as keyof CatalogItem] as any) ?? "")}
                onChangeText={v => setEditing(e => ({ ...e!, [f.k]: f.num ? Number(v) || 0 : v }))}
                keyboardType={f.num ? "decimal-pad" : "default"}
              />
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
              <Text style={{ color: colors.foreground, flex: 1 }}>Available</Text>
              <Switch value={editing?.available !== false} onValueChange={v => setEditing(e => ({ ...e!, available: v }))} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={save}>
                <Text style={styles.primaryBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setEditing(null)}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------------------------------- ORDERS ---------------------------------- */
function OrdersPane({ authHeaders }: { authHeaders?: Record<string, string> }) {
  const colors = useColors();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [wholesalerId, setWholesalerId] = useState("");
  const [kiranaPhone, setKiranaPhone] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const q = new URLSearchParams();
      if (status.trim()) q.set("status", status.trim());
      if (wholesalerId.trim()) q.set("wholesalerId", wholesalerId.trim());
      if (kiranaPhone.trim()) q.set("kiranaPhone", kiranaPhone.trim());
      const { orders } = await apiGet<{ orders: Order[] }>(`/api/admin/orders${q.toString() ? `?${q.toString()}` : ""}`, authHeaders);
      setOrders(orders);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders");
    } finally { setLoading(false); }
  }, [status, wholesalerId, kiranaPhone, authHeaders]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        value={status}
        onChangeText={setStatus}
        placeholder="Filter status (pending/confirmed/...)"
        placeholderTextColor={colors.mutedForeground}
      />
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        value={wholesalerId}
        onChangeText={setWholesalerId}
        placeholder="Filter wholesalerId (e.g. w001)"
        placeholderTextColor={colors.mutedForeground}
      />
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        value={kiranaPhone}
        onChangeText={setKiranaPhone}
        placeholder="Filter kirana phone"
        placeholderTextColor={colors.mutedForeground}
      />
      <View style={styles.paneHeader}>
        <Text style={[styles.paneTitle, { color: colors.foreground }]}>Orders ({orders.length})</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={load}>
          <Feather name="refresh-cw" size={14} color="#FFF" />
          <Text style={styles.addBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : orders.map(o => (
        <View key={o.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{o.shopName} → {o.wholesalerId}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {o.items.length} items · {o.status} · ₹{o.totalAmount ?? "—"} · {new Date(o.createdAt).toLocaleString()}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ----------------------------------- USERS ----------------------------------- */
function UsersPane({ authHeaders }: { authHeaders?: Record<string, string> }) {
  const colors = useColors();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<UserDrilldown | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const { users } = await apiGet<{ users: UserRow[] }>("/api/admin/users", authHeaders);
      setUsers(users);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally { setLoading(false); }
  }, [authHeaders]);
  useEffect(() => { load(); }, [load]);

  const remove = async (phone: string) => {
    const ok = await confirm(
      "Delete this user?",
      "This will also delete all of their orders. Cannot be undone.",
      { okLabel: "Delete", destructive: true },
    );
    if (!ok) return;
    try { await apiDelete(`/api/admin/users/${encodeURIComponent(phone)}`, authHeaders); load(); }
    catch (err: any) { Alert.alert("Delete failed", err?.message || "Unknown error"); }
  };

  const toggleVerify = async (u: UserRow) => {
    try {
      await apiPatch(`/api/admin/users/${encodeURIComponent(u.phone)}`, { verified: !u.verified }, authHeaders);
      load();
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Unknown error");
    }
  };

  const openDrilldown = async (phone: string) => {
    try {
      setDrilldownLoading(true);
      const data = await apiGet<UserDrilldown>(`/api/admin/users/${encodeURIComponent(phone)}/drilldown`, authHeaders);
      setDrilldown(data);
    } catch (err: any) {
      Alert.alert("Load failed", err?.message || "Unknown error");
    } finally {
      setDrilldownLoading(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.paneHeader}>
        <Text style={[styles.paneTitle, { color: colors.foreground }]}>Users ({users.length})</Text>
      </View>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : users.map(u => (
        <View key={u.phone} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>{u.name} · {u.role}</Text>
              {u.verified && <Feather name="shield" size={13} color={colors.available} />}
            </View>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>+91 {u.phone} · {u.shopName}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              GSTIN: {u.gstin || "—"}  ·  FSSAI: {u.fssai || "—"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => toggleVerify(u)} style={styles.iconBtn}>
            <Feather name={u.verified ? "shield-off" : "shield"} size={16} color={u.verified ? colors.mutedForeground : colors.available} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDrilldown(u.phone)} style={styles.iconBtn}>
            <Feather name="eye" size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(u.phone)} style={styles.iconBtn}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      ))}

      <Modal visible={!!drilldown || drilldownLoading} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Kirana drilldown</Text>
            {drilldownLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : drilldown ? (
              <ScrollView>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{drilldown.user.name}</Text>
                <Text style={{ color: colors.mutedForeground }}>+91 {drilldown.user.phone}</Text>
                <Text style={{ color: colors.mutedForeground, marginBottom: 10 }}>{drilldown.user.shopName}</Text>
                {drilldown.history.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground }}>No order history.</Text>
                ) : (
                  drilldown.history.map((o) => (
                    <View key={o.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{o.id} · {o.status}</Text>
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                          {o.items.length} items · ₹{o.totalAmount ?? "—"} · {new Date(o.createdAt).toLocaleString()}
                        </Text>
                        {o.deliveryAddress ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Delivery: {o.deliveryAddress}</Text> : null}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            ) : null}
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setDrilldown(null)}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loginBox: { marginHorizontal: 20, gap: 10 },
  logoCircle: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 8 },
  input: { height: 48, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_500Medium" },
  err: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  primaryBtn: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  secondaryBtn: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingTop: 8 },
  linkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  topBarTitle: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  topBarBtn: { padding: 6 },
  tabs: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  tile: { flexBasis: "47%", flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 16 },
  tileValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  tileLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  paneHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  paneTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: "#FFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  iconBtn: { padding: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
