import { db } from "./firebase";
import { FieldValue } from "firebase-admin/firestore";

interface SeedItem {
  name: string; nameTe: string; nameHi: string;
  unit: string; pricePerUnit: number;
  available: boolean; minOrderQty: number; offer?: string;
}

interface SeedWholesaler {
  id: string; name: string; ownerName: string; ownerPhone: string;
  location: string; distance: string; rating: number; specialOffer?: string;
  catalog: SeedItem[];
}

const SEED: SeedWholesaler[] = [
  {
    id: "w001", name: "Suresh Wholesale", ownerName: "Suresh Guptha",
    ownerPhone: "9876543210", location: "Main Market, Vijayawada",
    distance: "2.5 km", rating: 4.5, specialOffer: "10% off on orders above ₹2000",
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
    id: "w002", name: "Ramesh Traders", ownerName: "Ramesh Kumar",
    ownerPhone: "9845612300", location: "Bus Stand Road, Guntur",
    distance: "4.1 km", rating: 4.2, specialOffer: "Free delivery on orders above ₹1500",
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
      { name: "Wheat Flour", nameTe: "గోధుమ పిండి", nameHi: "गेहूं का आటా", unit: "kg", pricePerUnit: 36, available: true, minOrderQty: 5 },
      { name: "Detergent", nameTe: "డిటర్జెంట్", nameHi: "डिटर्जेंट", unit: "kg", pricePerUnit: 88, available: true, minOrderQty: 1 },
      { name: "Milk Packet", nameTe: "పాల ప్యాకెట్", nameHi: "दूध पैकेट", unit: "litre", pricePerUnit: 60, available: true, minOrderQty: 10 },
      { name: "Groundnut Oil", nameTe: "వేరుశెనగ నూనె", nameHi: "मूंगफली तेल", unit: "litre", pricePerUnit: 170, available: true, minOrderQty: 1 },
    ],
  },
  {
    id: "w003", name: "Krishna Wholesale", ownerName: "Krishna Rao",
    ownerPhone: "9900112233", location: "Old Town, Vijayawada",
    distance: "1.2 km", rating: 4.8, specialOffer: "Lowest price guarantee",
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

export async function seedIfEmpty() {
  const snap = await db.collection("wholesalers").limit(1).get();
  if (!snap.empty) return { seeded: false, count: 0 };

  for (const w of SEED) {
    await db.collection("wholesalers").doc(w.id).set({
      id: w.id, name: w.name, ownerName: w.ownerName,
      ownerPhone: w.ownerPhone, location: w.location,
      distance: w.distance, rating: w.rating,
      specialOffer: w.specialOffer ?? null,
      active: true, verified: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const batch = db.batch();
    for (const c of w.catalog) {
      const ref = db.collection("wholesalers").doc(w.id).collection("catalog").doc();
      batch.set(ref, {
        wholesalerId: w.id, name: c.name,
        nameTe: c.nameTe, nameHi: c.nameHi,
        unit: c.unit, pricePerUnit: c.pricePerUnit,
        available: c.available, minOrderQty: c.minOrderQty,
        offer: c.offer ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { seeded: true, count: SEED.length };
}
