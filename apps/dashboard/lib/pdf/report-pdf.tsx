import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Bullets, Footer, Header, s, C } from "./brand";
import type { ReportContent } from "@/lib/reports/service";

const usd = (c: number | null | undefined) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);

export function ReportPdf({ r, agencyName, clientName }: { r: ReportContent; agencyName: string; clientName: string }) {
  const tiles: [string, string][] = [
    ["Ad spend", usd(r.metrics.current.spend)],
    ["Leads + chats", String(r.metrics.current.results)],
    ["Cost per result", usd(r.metrics.current.cpr)],
    ["WhatsApp chats", String(r.metrics.current.chats)],
  ];
  return (
    <Document title={`${r.title} — ${clientName}`} author={agencyName}>
      <Page size="A4" style={s.page}>
        <Header kicker={agencyName} title={r.title} subtitle={`${clientName} · ${r.periodLabel}`} />
        <View style={s.body}>
          <Text style={[s.bold, { fontSize: 12, marginBottom: 6 }]}>{r.headline}</Text>
          <View style={[s.row, { gap: 6, marginBottom: 4 }]}>
            {tiles.map(([k, v]) => (
              <View key={k} style={[s.card, { flex: 1 }]}>
                <Text style={{ color: C.muted, fontSize: 8 }}>{k}</Text>
                <Text style={[s.bold, { fontSize: 14 }]}>{v}</Text>
              </View>
            ))}
          </View>
          {r.targetCpr ? <Text style={{ color: C.muted }}>Target cost per result: {usd(r.targetCpr)}{r.metrics.previous.results ? ` · previous period: ${r.metrics.previous.results} results at ${usd(r.metrics.previous.cpr)}` : ""}</Text> : null}
          {r.metrics.best ? (
            <>
              <Text style={s.h}>Best ad</Text>
              <View style={s.card}><Text style={s.bold}>{r.metrics.best.adName}</Text><Text>{r.metrics.best.results} results at {usd(r.metrics.best.cpr)} each</Text></View>
            </>
          ) : null}
          {r.metrics.worst ? (
            <>
              <Text style={s.h}>Weakest ad</Text>
              <View style={s.card}><Text style={s.bold}>{r.metrics.worst.adName}</Text><Text>{r.metrics.worst.results} results · {usd(r.metrics.worst.spend)} spent</Text></View>
            </>
          ) : null}
          <Text style={s.h}>What happened</Text>
          <Bullets items={r.whatHappened} />
          {r.whatWorked.length ? (<><Text style={s.h}>What worked</Text><Bullets items={r.whatWorked} /></>) : null}
          <Text style={s.h}>{r.type === "weekly" ? "What changes this week" : "Next month's plan"}</Text>
          <Bullets items={r.whatChanges} />
          {r.upsell ? (<><Text style={s.h}>Next step</Text><Text>{r.upsell}</Text></>) : null}
        </View>
        <Footer left={`${agencyName} · ${r.periodLabel}`} />
      </Page>
    </Document>
  );
}
