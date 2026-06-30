import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

/**
 * "?" icon that opens a small modal explaining India GST rates with
 * common kirana examples. Drop next to any Tax % field.
 */
export function TaxHelpButton({ size = 16 }: { size?: number }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const rates = [
    {
      pct: "0%",
      label: "Essentials & fresh food",
      examples: ["Rice (loose)", "Wheat flour (loose)", "Toor dal", "Salt", "Fresh milk", "Vegetables", "Fresh fruit", "Bread"],
      tip: "If you sell loose/unbranded grains and dals, this is almost always you.",
    },
    {
      pct: "5%",
      label: "Packaged staples",
      examples: ["Sugar", "Tea powder", "Coffee", "Edible oil (packed)", "Masala packets", "Sweets", "Cashew", "Branded atta/rice"],
      tip: "Most of your packaged daily-use items fall here.",
    },
    {
      pct: "12%",
      label: "Processed food",
      examples: ["Ghee", "Butter", "Cheese", "Frozen veg", "Namkeen", "Jam", "Sauces", "Packed juice"],
      tip: "Anything cooked/processed but not a snack or luxury.",
    },
    {
      pct: "18%",
      label: "Snacks, cleaning, packaged drinks",
      examples: ["Biscuits", "Chocolate", "Ice cream", "Soap", "Detergent", "Shampoo", "Toothpaste", "Packaged water"],
      tip: "Most of your non-food and packaged snack inventory.",
    },
    {
      pct: "28%",
      label: "Luxury / sin goods",
      examples: ["Aerated drinks (Coke, Pepsi)", "Pan masala"],
      tip: "Rare for kirana — only if you stock soft drinks.",
    },
  ];

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{ marginLeft: 4 }}
      >
        <Feather name="help-circle" size={size} color={colors.accent} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.foreground }]}>What number do I put for Tax %?</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              This is the GST rate that applies to that one item. Pick from the table below — if not sure, leave it 0.
            </Text>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {rates.map((r) => (
                <View key={r.pct} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={styles.cardHead}>
                    <View style={[styles.pctPill, { backgroundColor: colors.primary + "1a", borderColor: colors.primary + "55" }]}>
                      <Text style={[styles.pctText, { color: colors.primary }]}>{r.pct}</Text>
                    </View>
                    <Text style={[styles.cardLabel, { color: colors.foreground }]}>{r.label}</Text>
                  </View>
                  <Text style={[styles.examples, { color: colors.mutedForeground }]}>
                    {r.examples.join(" · ")}
                  </Text>
                  <Text style={[styles.tip, { color: colors.accent }]}>{r.tip}</Text>
                </View>
              ))}

              <View style={[styles.formulaBox, { backgroundColor: colors.primary + "0e", borderColor: colors.primary + "33" }]}>
                <Text style={[styles.formulaTitle, { color: colors.foreground }]}>How the math works</Text>
                <Text style={[styles.formulaText, { color: colors.foreground }]}>
                  When a kirana orders this item, the bill is built as:
                </Text>
                <Text style={[styles.formula, { color: colors.foreground }]}>
                  qty × price + (qty × price × tax%) − discount
                </Text>
                <Text style={[styles.formulaText, { color: colors.mutedForeground }]}>
                  Example: 5 kg sugar at ₹45 with 5% tax{"\n"}
                  = 5 × 45 = ₹225{"\n"}
                  + 5% tax = ₹11.25{"\n"}
                  = ₹236.25
                </Text>
                <Text style={[styles.formulaText, { color: colors.mutedForeground }]}>
                  If your price already includes tax, set Tax % to 0.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={[styles.closeBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "88%", gap: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 6 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 6 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  pctPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pctText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  cardLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  examples: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  tip: { fontSize: 12, fontFamily: "Inter_500Medium" },
  formulaBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6, marginTop: 4 },
  formulaTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  formulaText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  formula: { fontSize: 13, fontFamily: "Inter_700Bold" },
  closeBtn: { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
});
