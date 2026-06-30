import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type Variant = "shopping" | "inventory";

const SHOPPING_ROWS: Record<string, { name: string; qty: string }[]> = {
  en: [
    { name: "Rice", qty: "5 kg" },
    { name: "Toor Dal", qty: "2 kg" },
    { name: "Sugar", qty: "1 kg" },
    { name: "Sunflower Oil", qty: "2 L" },
    { name: "Tea Powder", qty: "500 g" },
  ],
  hi: [
    { name: "चावल", qty: "5 kg" },
    { name: "तूर दाल", qty: "2 kg" },
    { name: "चीनी", qty: "1 kg" },
    { name: "तेल", qty: "2 L" },
    { name: "चाय", qty: "500 g" },
  ],
  te: [
    { name: "బియ్యం", qty: "5 kg" },
    { name: "కందిపప్పు", qty: "2 kg" },
    { name: "చక్కెర", qty: "1 kg" },
    { name: "నూనె", qty: "2 L" },
    { name: "టీ పొడి", qty: "500 g" },
  ],
};

const INVENTORY_ROWS: Record<string, { name: string; unit: string; price: string; stock: string }[]> = {
  en: [
    { name: "Rice", unit: "kg", price: "₹50", stock: "20 kg" },
    { name: "Sugar", unit: "kg", price: "₹45", stock: "30 kg" },
    { name: "Oil", unit: "L",  price: "₹140", stock: "15 L" },
    { name: "Dal", unit: "kg", price: "₹110", stock: "12 kg" },
  ],
  hi: [
    { name: "चावल", unit: "kg", price: "₹50", stock: "20 kg" },
    { name: "चीनी", unit: "kg", price: "₹45", stock: "30 kg" },
    { name: "तेल",  unit: "L",  price: "₹140", stock: "15 L" },
    { name: "दाल",  unit: "kg", price: "₹110", stock: "12 kg" },
  ],
  te: [
    { name: "బియ్యం", unit: "kg", price: "₹50", stock: "20 kg" },
    { name: "చక్కెర",  unit: "kg", price: "₹45", stock: "30 kg" },
    { name: "నూనె",    unit: "L",  price: "₹140", stock: "15 L" },
    { name: "పప్పు",   unit: "kg", price: "₹110", stock: "12 kg" },
  ],
};

export function SampleListCard({ variant }: { variant: Variant }) {
  const colors = useColors();
  const { language } = useLanguage();
  const lang = (language ?? "en") as "en" | "te" | "hi";

  const title =
    variant === "shopping"
      ? (lang === "te" ? "ఇలాంటి జాబితా బాగుంటుంది" : lang === "hi" ? "इस तरह की लिस्ट सही है" : "A good list looks like this")
      : (lang === "te" ? "ఇలాంటి ధర జాబితా బాగుంటుంది" : lang === "hi" ? "इस तरह की प्राइस लिस्ट सही है" : "A good price list looks like this");

  return (
    <View style={[styles.outer, { borderColor: colors.border }]}>
      <View style={[styles.tape, { backgroundColor: "#F5D58A" }]} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{title}</Text>

      <View style={[styles.paper, { borderColor: colors.border }]}>
        {/* notebook ruled lines */}
        <View style={[styles.redMargin, { backgroundColor: "#E5808055" }]} />
        {variant === "shopping" ? (
          SHOPPING_ROWS[lang].map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.handwriting}>{r.name}</Text>
              <Text style={styles.handwriting}>{r.qty}</Text>
            </View>
          ))
        ) : (
          <View style={{ gap: 6 }}>
            <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#0008", paddingBottom: 4 }]}>
              <Text style={[styles.handHeader, { flex: 2 }]}>Item</Text>
              <Text style={[styles.handHeader, { width: 44, textAlign: "right" }]}>Price</Text>
              <Text style={[styles.handHeader, { width: 60, textAlign: "right" }]}>Stock</Text>
            </View>
            {INVENTORY_ROWS[lang].map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.handwriting, { flex: 2 }]}>{r.name} ({r.unit})</Text>
                <Text style={[styles.handwriting, { width: 44, textAlign: "right" }]}>{r.price}</Text>
                <Text style={[styles.handwriting, { width: 60, textAlign: "right" }]}>{r.stock}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, alignItems: "stretch" },
  tape: { position: "absolute", top: -8, alignSelf: "center", width: 80, height: 16, borderRadius: 2, opacity: 0.85, transform: [{ rotate: "-3deg" }] },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center", marginTop: 4 },
  paper: { backgroundColor: "#FFFBE6", borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, position: "relative", gap: 4 },
  redMargin: { position: "absolute", left: 8, top: 0, bottom: 0, width: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  // We don't ship a real handwriting font; use a softer system look with slight letter-spacing
  handwriting: { fontSize: 14, color: "#3a2a14", fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
  handHeader: { fontSize: 11, color: "#5a4222", fontFamily: "Inter_700Bold", letterSpacing: 0.4, textTransform: "uppercase" },
});
