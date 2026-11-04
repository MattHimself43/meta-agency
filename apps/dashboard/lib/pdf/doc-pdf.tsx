import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SECTIONS, type DocKind } from "@/lib/docs/sections";
import { formatMoney } from "@/lib/money";

type Rec = Record<string, unknown>;
type Pkg = { name: string; setupFeeCents: number; monthlyFeeCents: number; includes: string[]; recommendedSpend: string | null } | null;

// Landing-page palette on paper: navy header band, blue→cyan accent, readable dark text on white.
const C = { navy: "#050914", blue: "#2e6bff", cyan: "#5fe3ff", text: "#0b1430", muted: "#5f6f92", line: "#dbe4f5" };
const s = StyleSheet.create({
  page: { paddingBottom: 48, fontSize: 10, color: C.text, fontFamily: "Helvetica", lineHeight: 1.45 },
  band: { backgroundColor: C.navy, paddingHorizontal: 36, paddingTop: 26, paddingBottom: 22 },
  bar: { height: 3, backgroundColor: C.cyan },
  agency: { color: C.cyan, fontSize: 8, letterSpacing: 2, textTransform: "uppercase" },
  title: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 6 },
  subtitle: { color: "#93a4c6", fontSize: 10, marginTop: 4 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  h: { color: C.blue, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase", marginTop: 14, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 8, marginBottom: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
  bullet: { flexDirection: "row", marginBottom: 3 },
  dot: { width: 10, color: C.blue },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

export function DocPdf({ kind, content, title, subtitle, agencyName, pkg, setupWaived }: { kind: DocKind; content: Rec; title: string; subtitle: string; agencyName: string; pkg?: Pkg; setupWaived?: boolean }) {
  const sections = SECTIONS[kind].filter((x) => !["headline", "title", "package_slug", "suggested_package_slug"].includes(x.key));
  return (
    <Document title={title} author={agencyName}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.agency}>{agencyName}</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
        <View style={s.bar} />
        <View style={s.body}>
          {sections.map((sec) => {
            const v = content[sec.key];
            if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
            return (
              <View key={sec.key} wrap={false}>
                <Text style={s.h}>{sec.title}</Text>
                {sec.type === "text" ? <Text>{String(v)}</Text> : null}
                {sec.type === "list" ? (v as string[]).map((x, i) => <View key={i} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{x}</Text></View>) : null}
                {sec.type === "pairs" ? (v as Rec[]).map((p, i) => <View key={i} style={s.card}><Text style={s.bold}>{String(p[sec.a] ?? "")}</Text><Text>{String(p[sec.b] ?? "")}</Text></View>) : null}
                {sec.type === "object" ? <View style={s.card}>{sec.fields.map((f) => ((v as Rec)[f.key] ? <Text key={f.key}><Text style={s.bold}>{f.label}: </Text>{String((v as Rec)[f.key])}</Text> : null))}</View> : null}
              </View>
            );
          })}
          {kind === "proposal" && pkg ? (
            <View wrap={false}>
              <Text style={s.h}>Package &amp; investment</Text>
              <View style={s.card}>
                <Text style={[s.bold, { fontSize: 13 }]}>{pkg.name} — {formatMoney(pkg.monthlyFeeCents, "TTD", { decimals: false })}/month</Text>
                <Text>Setup: {setupWaived ? `${formatMoney(pkg.setupFeeCents, "TTD", { decimals: false })} — waived (founding client)` : formatMoney(pkg.setupFeeCents, "TTD", { decimals: false })}</Text>
                {pkg.includes.map((x) => <View key={x} style={s.bullet}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{x}</Text></View>)}
                {pkg.recommendedSpend ? <Text style={{ color: C.muted, marginTop: 4 }}>Recommended ad spend, paid by you directly to Meta: {pkg.recommendedSpend}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
        <View style={s.footer} fixed>
          <Text>{agencyName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
