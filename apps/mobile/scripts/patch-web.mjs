import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("dist/index.html", "utf8");
const fontFace = `    <style>
      @font-face {
        font-family: 'Feather';
        src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.1.1/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    </style>\n`;

if (!html.includes("font-family: 'Feather'")) {
  writeFileSync("dist/index.html", html.replace("    <style id=\"expo-reset\">", fontFace + "    <style id=\"expo-reset\">"));
  console.log("Patched dist/index.html with Feather font CDN");
}
