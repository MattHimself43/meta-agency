import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

/** Shared PDF look: navy header band with the landing page's cyan accent, dark text on white. */
export const C = { navy: "#050914", blue: "#2e6bff", cyan: "#5fe3ff", text: "#0b1430", muted: "#5f6f92", line: "#dbe4f5", green: "#0f8a5f", red: "#c0392b" };
export const s = StyleSheet.create({
  page: { paddingBottom: 48, fontSize: 10, color: C.text, fontFamily: "Helvetica", lineHeight: 1.45 },
  band: { backgroundColor: C.navy, paddingHorizontal: 36, paddingTop: 24, paddingBottom: 20 },
  bar: { height: 3, backgroundColor: C.cyan },
  kicker: { color: C.cyan, fontSize: 8, letterSpacing: 2, textTransform: "uppercase" },
  title: { color: "#ffffff", fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 6 },
  subtitle: { color: "#93a4c6", fontSize: 10, marginTop: 4 },
  body: { paddingHorizontal: 36, paddingTop: 16 },
  h: { color: C.blue, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase", marginTop: 14, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 8, marginBottom: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  bullet: { flexDirection: "row", marginBottom: 3 },
  dot: { width: 10, color: C.blue },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 4, marginBottom: 4, color: C.muted, fontSize: 8, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.line },
});

export function Header({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <>
      <View style={s.band}>
        <Text style={s.kicker}>{kicker}</Text>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={s.bar} />
    </>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((x, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.dot}>•</Text>
          <Text style={{ flex: 1 }}>{x}</Text>
        </View>
      ))}
    </>
  );
}
