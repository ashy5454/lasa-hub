export interface CatalogItem {
  name: string;
  nameTe: string;
  nameHi: string;
  unit: string;
  pricePerUnit: number;
  available: boolean;
  minOrderQty: number;
  offer?: string;
  stockQuantity?: number | null;
  taxPercent?: number | null;
  category?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  leadTime?: string | null;
  extraInfo?: string | null;
}

export interface Wholesaler {
  id: string;
  name: string;
  ownerName: string;
  location: string;
  phone: string;
  distance: string;
  computedDistance?: number;
  rating: number;
  specialOffer?: string;
  catalog: CatalogItem[];
  lat?: number | null;
  lng?: number | null;
  gstin?: string | null;
  fssai?: string | null;
  verified?: boolean;
  defaultTaxPercent?: number;
  defaultDiscountPercent?: number;
  defaultDeliveryTime?: string | null;
  fromAddress?: string | null;
}

export const WHOLESALERS: Wholesaler[] = [
  {
    id: "w001",
    name: "Suresh Wholesale",
    ownerName: "Suresh Guptha",
    location: "Main Market, Vijayawada",
    phone: "9876543210",
    distance: "2.5 km",
    rating: 4.5,
    specialOffer: "10% off on orders above ₹2000",
    catalog: [
      { name: "Toor Dal", nameTe: "కందిపప్పు", nameHi: "तूर दाल", unit: "kg", pricePerUnit: 135, available: true, minOrderQty: 1 },
      { name: "Rice Basmati", nameTe: "బాస్మతి బియ్యం", nameHi: "बासमती चावल", unit: "kg", pricePerUnit: 85, available: true, minOrderQty: 5 },
      { name: "Sunflower Oil", nameTe: "పొద్దుతిరుగుడు నూనె", nameHi: "सूरजमुखी तेल", unit: "litre", pricePerUnit: 140, available: false, minOrderQty: 1 },
      { name: "Sugar", nameTe: "చక్కెర", nameHi: "चीनी", unit: "kg", pricePerUnit: 45, available: true, minOrderQty: 1 },
      { name: "Tea Powder", nameTe: "టీ పొడి", nameHi: "चाय पाउडर", unit: "kg", pricePerUnit: 320, available: true, minOrderQty: 0.5, offer: "Buy 1kg get 100gm free" },
      { name: "Salt", nameTe: "ఉప్పు", nameHi: "नमक", unit: "kg", pricePerUnit: 18, available: true, minOrderQty: 1 },
      { name: "Chilli Powder", nameTe: "మిరపకాయ పొడి", nameHi: "मिर्च पाउडर", unit: "kg", pricePerUnit: 220, available: true, minOrderQty: 0.25 },
      { name: "Turmeric", nameTe: "పసుపు", nameHi: "हल्दी", unit: "kg", pricePerUnit: 180, available: true, minOrderQty: 0.25 },
      { name: "Coconut Oil", nameTe: "కొబ్బరి నూనె", nameHi: "नारियल तेल", unit: "litre", pricePerUnit: 165, available: true, minOrderQty: 1 },
      { name: "Biscuits Parle-G", nameTe: "పార్లే-జి బిస్కెట్లు", nameHi: "पारले-जी बिस्किट", unit: "box", pricePerUnit: 240, available: true, minOrderQty: 1 },
      { name: "Groundnut Oil", nameTe: "వేరుశెనగ నూనె", nameHi: "मूंगफली तेल", unit: "litre", pricePerUnit: 175, available: false, minOrderQty: 1 },
      { name: "Wheat Flour", nameTe: "గోధుమ పిండి", nameHi: "गेहूं का आटा", unit: "kg", pricePerUnit: 38, available: true, minOrderQty: 5 },
      { name: "Soap", nameTe: "సబ్బు", nameHi: "साबुन", unit: "piece", pricePerUnit: 22, available: true, minOrderQty: 12, offer: "12 at price of 10" },
      { name: "Detergent", nameTe: "డిటర్జెంట్", nameHi: "डिटर्जेंट", unit: "kg", pricePerUnit: 95, available: true, minOrderQty: 1 },
      { name: "Milk Packet", nameTe: "పాల ప్యాకెట్", nameHi: "दूध पैकेट", unit: "litre", pricePerUnit: 62, available: false, minOrderQty: 5 },
    ],
  },
  {
    id: "w002",
    name: "Ramesh Traders",
    ownerName: "Ramesh Kumar",
    location: "Bus Stand Road, Guntur",
    phone: "9845612300",
    distance: "4.1 km",
    rating: 4.2,
    specialOffer: "Free delivery on orders above ₹1500",
    catalog: [
      { name: "Toor Dal", nameTe: "కందిపప్పు", nameHi: "तूर दाल", unit: "kg", pricePerUnit: 130, available: true, minOrderQty: 2 },
      { name: "Rice Basmati", nameTe: "బాస్మతి బియ్యం", nameHi: "बासमती चावल", unit: "kg", pricePerUnit: 82, available: true, minOrderQty: 5 },
      { name: "Sunflower Oil", nameTe: "పొద్దుతిరుగుడు నూనె", nameHi: "सूरजमुखी तेल", unit: "litre", pricePerUnit: 138, available: true, minOrderQty: 1 },
      { name: "Sugar", nameTe: "చక్కెర", nameHi: "चीनी", unit: "kg", pricePerUnit: 43, available: true, minOrderQty: 2 },
      { name: "Tea Powder", nameTe: "టీ పొడి", nameHi: "चाय पाउडर", unit: "kg", pricePerUnit: 310, available: true, minOrderQty: 0.5 },
      { name: "Salt", nameTe: "ఉప్పు", nameHi: "नमक", unit: "kg", pricePerUnit: 16, available: true, minOrderQty: 2 },
      { name: "Chilli Powder", nameTe: "మిరపకాయ పొడి", nameHi: "मिर्च पाउडर", unit: "kg", pricePerUnit: 210, available: true, minOrderQty: 0.5 },
      { name: "Turmeric", nameTe: "పసుపు", nameHi: "हल्दी", unit: "kg", pricePerUnit: 170, available: false, minOrderQty: 0.25 },
      { name: "Coconut Oil", nameTe: "కొబ్బరి నూనె", nameHi: "नारियल तेल", unit: "litre", pricePerUnit: 160, available: true, minOrderQty: 1, offer: "Buy 5L get 500ml free" },
      { name: "Biscuits Parle-G", nameTe: "పార్లే-జి బిస్కెట్లు", nameHi: "पारले-जी बिस्किट", unit: "box", pricePerUnit: 230, available: true, minOrderQty: 1 },
      { name: "Wheat Flour", nameTe: "గోధుమ పిండి", nameHi: "गेहूं का आटा", unit: "kg", pricePerUnit: 36, available: true, minOrderQty: 5 },
      { name: "Detergent", nameTe: "డిటర్జెంట్", nameHi: "डिटर्जेंट", unit: "kg", pricePerUnit: 88, available: true, minOrderQty: 1 },
      { name: "Milk Packet", nameTe: "పాల ప్యాకెట్", nameHi: "दूध पैकेट", unit: "litre", pricePerUnit: 60, available: true, minOrderQty: 10 },
      { name: "Groundnut Oil", nameTe: "వేరుశెనగ నూనె", nameHi: "मूंगफली तेल", unit: "litre", pricePerUnit: 170, available: true, minOrderQty: 1 },
    ],
  },
  {
    id: "w003",
    name: "Krishna Wholesale",
    ownerName: "Krishna Rao",
    location: "Old Town, Vijayawada",
    phone: "9900112233",
    distance: "1.2 km",
    rating: 4.8,
    specialOffer: "Lowest price guarantee",
    catalog: [
      { name: "Toor Dal", nameTe: "కందిపప్పు", nameHi: "तूर दाल", unit: "kg", pricePerUnit: 128, available: true, minOrderQty: 1, offer: "Lowest in market" },
      { name: "Rice Basmati", nameTe: "బాస్మతి బియ్యం", nameHi: "बासमती चावल", unit: "kg", pricePerUnit: 80, available: false, minOrderQty: 5 },
      { name: "Sunflower Oil", nameTe: "పొద్దుతిరుగుడు నూనె", nameHi: "सूरजमुखी तेल", unit: "litre", pricePerUnit: 135, available: true, minOrderQty: 1 },
      { name: "Sugar", nameTe: "చక్కెర", nameHi: "चीनी", unit: "kg", pricePerUnit: 42, available: true, minOrderQty: 1 },
      { name: "Tea Powder", nameTe: "టీ పొడి", nameHi: "चाय पाउडर", unit: "kg", pricePerUnit: 300, available: true, minOrderQty: 0.5 },
      { name: "Salt", nameTe: "ఉప్పు", nameHi: "नमक", unit: "kg", pricePerUnit: 15, available: true, minOrderQty: 1 },
      { name: "Chilli Powder", nameTe: "మిరపకాయ పొడి", nameHi: "मिर्च पाउडर", unit: "kg", pricePerUnit: 200, available: true, minOrderQty: 0.25 },
      { name: "Turmeric", nameTe: "పసుపు", nameHi: "हल्दी", unit: "kg", pricePerUnit: 165, available: true, minOrderQty: 0.25 },
      { name: "Coconut Oil", nameTe: "కొబ్బరి నూనె", nameHi: "नारियल तेल", unit: "litre", pricePerUnit: 158, available: true, minOrderQty: 1 },
      { name: "Wheat Flour", nameTe: "గోధుమ పిండి", nameHi: "गेहूं का आटा", unit: "kg", pricePerUnit: 34, available: true, minOrderQty: 5, offer: "Best quality" },
      { name: "Soap", nameTe: "సబ్బు", nameHi: "साबुन", unit: "piece", pricePerUnit: 20, available: true, minOrderQty: 12 },
      { name: "Detergent", nameTe: "డిటర్జెంట్", nameHi: "डिटर्जेंट", unit: "kg", pricePerUnit: 85, available: true, minOrderQty: 1 },
      { name: "Groundnut Oil", nameTe: "వేరుశెనగ నూనె", nameHi: "मूंगफली तेल", unit: "litre", pricePerUnit: 168, available: true, minOrderQty: 1 },
      { name: "Milk Packet", nameTe: "పాల ప్యాకెట్", nameHi: "दूध पैकेट", unit: "litre", pricePerUnit: 58, available: true, minOrderQty: 5 },
      { name: "Biscuits Parle-G", nameTe: "పార్లే-జి బిస్కెట్లు", nameHi: "पारले-जी बिस्किट", unit: "box", pricePerUnit: 225, available: false, minOrderQty: 2 },
    ],
  },
];

export function getWholesalerById(id: string): Wholesaler | undefined {
  return WHOLESALERS.find(w => w.id === id);
}

export function getItemAvailability(wholesalerId: string, itemName: string): boolean {
  const w = getWholesalerById(wholesalerId);
  if (!w) return true;
  const found = w.catalog.find(c => c.name.toLowerCase() === itemName.toLowerCase());
  return found ? found.available : true;
}

export function getItemNameInLanguage(item: CatalogItem, language: string): string {
  if (language === "te") return item.nameTe;
  if (language === "hi") return item.nameHi;
  return item.name;
}

/**
 * Pick the right display name for a generic item across the app.
 * Works for any item shaped like { name, nameTe?, nameHi? } — order items,
 * scanned items, catalog items, etc. Falls back to the English `name`
 * (always present as canonical) if a translated variant is missing.
 */
export function pickName(
  item: { name?: string; nameTe?: string | null; nameHi?: string | null } | undefined,
  language: string,
): string {
  if (!item) return "";
  if (language === "te" && item.nameTe && item.nameTe.trim()) return item.nameTe;
  if (language === "hi" && item.nameHi && item.nameHi.trim()) return item.nameHi;
  return item.name ?? "";
}
