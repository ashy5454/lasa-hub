import React from "react";
import { Image, Platform, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

/**
 * Lasa Hub brand logo. Always circular.
 *
 * USAGE
 *   <LasaLogo />              // default 96px, good in headers
 *   <LasaLogo size={140} />   // login / splash hero
 *   <LasaLogo size={32} />    // tiny corner mark
 *
 * REAL ARTWORK
 * Drop your sticker PNG at:
 *   artifacts/lasa-hub/assets/images/lasa-logo.png
 *
 * The PNG should be:
 *   - 512×512 or 1024×1024 (square, transparent background OK)
 *   - The actual circular artwork — no extra white padding
 *
 * Until that file exists this component renders a clean stylized
 * fallback (red circle + "LASA" text). That way the app never breaks
 * if the asset is missing, and any new screen wiring keeps working
 * regardless of asset state.
 */

// Real brand asset. JPEG is fine here — the `overflow: hidden` +
// borderRadius below clip the image to a circle, so the lack of
// transparency in JPEG corners gets masked out anyway. If you ever
// re-export as PNG with transparency, just rename the file and
// change the extension below.
const LOGO_PNG = require("@/assets/images/lasa-logo.jpeg");

type Props = {
  size?: number;
  /** Optional ring around the logo — useful on dark headers. */
  outline?: boolean;
  /** Override container style (e.g. positioning). */
  style?: StyleProp<ViewStyle>;
};

export function LasaLogo({ size = 96, outline = false, style }: Props) {
  const dim = { width: size, height: size };

  if (LOGO_PNG) {
    // The artwork file is ALREADY a circle (with a sticker peel curl
    // on the side) so we do NOT clip it to a perfect circle here —
    // that would cut off the peel curl and leave the JPEG's white
    // padding visible inside the crop as a halo.
    //
    // Instead we use resizeMode="contain" and let the white JPEG
    // padding blend invisibly with the white app background. The
    // sticker reads as its true shape (curl included), and there's
    // no double-ring artifact.
    //
    // The `outline` ring + drop shadow are deliberately omitted in
    // this branch — they were designed for the abstract fallback
    // circle. The real sticker has its own visual edge already.
    return (
      <View style={[dim, style]} accessibilityLabel="Lasa Hub">
        <Image
          source={LOGO_PNG as any}
          style={[dim as StyleProp<ImageStyle>, { resizeMode: "contain" }]}
        />
      </View>
    );
  }

  // ↓ Fallback branch only — uses the circular masking + outline.
  const fallbackDim = { ...dim, borderRadius: size / 2 };
  const ring = outline
    ? { borderWidth: Math.max(1, size * 0.04), borderColor: "#FFFFFF" }
    : undefined;

  // Stylized fallback — clean red circle with bold white "LASA". Looks
  // intentional rather than placeholder-y so screens look fine even
  // before the artwork lands.
  return (
    <View
      style={[
        styles.shadow,
        styles.fallback,
        fallbackDim,
        ring,
        style,
      ]}
      accessibilityLabel="Lasa Hub"
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontFamily: "Inter_700Bold",
          fontSize: size * 0.32,
          letterSpacing: size * 0.015,
          // Centering math: nudge baseline up a touch so the type sits
          // optically centered, not mathematically centered.
          marginTop: size * 0.02,
        }}
        // Disable text selection on web so the logo behaves like an icon.
        selectable={false}
      >
        LASA
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    overflow: "hidden",
    // Subtle drop shadow so the circle reads as a sticker on light bg.
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fallback: {
    backgroundColor: "#D92E2E",
    alignItems: "center",
    justifyContent: "center",
  },
});
