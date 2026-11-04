import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Footer, Header, s, C } from "./brand";

type Agency = { name?: string; address?: string[]; registrationNumber?: string; vatNumber?: string | null; bank?: { bank: string; accountName: string; accountNumber: string; branch: string; accountType: string } };
type ClientSnap = { name?: string; contact?: string | null; email?: string | null; whatsapp?: string | null };

const ttd = (c: number) => `TT$${(c / 100).toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InvoicePdf(p: {
  number: string | null;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  agency: Agency;
  client: ClientSnap;
  lines: { description: string; quantity: string; unitCents: number; amountCents: number }[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  vatRatePct: number;
  paymentLink: string | null;
}) {
  const draft = !p.number;
  return (
    <Document title={`Invoice ${p.number ?? "draft"}`} author={p.agency.name}>
      <Page size="A4" style={s.page}>
        <Header kicker={p.agency.name ?? ""} title={draft ? "Invoice (draft)" : `Invoice ${p.number}`} subtitle={`${p.issueDate ? `Issued ${p.issueDate}` : "Not issued yet"}${p.dueDate ? ` · due ${p.dueDate}` : ""}`} />
        <View style={s.body}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <View>
              <Text style={s.h}>From</Text>
              <Text style={s.bold}>{p.agency.name}</Text>
              {(p.agency.address ?? []).map((l) => <Text key={l}>{l}</Text>)}
              {p.agency.registrationNumber ? <Text style={{ color: C.muted }}>Reg. {p.agency.registrationNumber}</Text> : null}
              {p.agency.vatNumber ? <Text style={{ color: C.muted }}>VAT {p.agency.vatNumber}</Text> : null}
            </View>
            <View>
              <Text style={s.h}>Bill to</Text>
              <Text style={s.bold}>{p.client.name}</Text>
              {p.client.contact ? <Text>{p.client.contact}</Text> : null}
              {p.client.email ? <Text>{p.client.email}</Text> : null}
              {p.client.whatsapp ? <Text>{p.client.whatsapp}</Text> : null}
            </View>
          </View>
          <View style={s.tableHead}>
            <Text style={{ flex: 4 }}>Description</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>Qty</Text>
            <Text style={{ flex: 2, textAlign: "right" }}>Unit</Text>
            <Text style={{ flex: 2, textAlign: "right" }}>Amount</Text>
          </View>
          {p.lines.map((l, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={{ flex: 4 }}>{l.description}</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>{Number(l.quantity)}</Text>
              <Text style={{ flex: 2, textAlign: "right" }}>{ttd(l.unitCents)}</Text>
              <Text style={{ flex: 2, textAlign: "right" }}>{ttd(l.amountCents)}</Text>
            </View>
          ))}
          <View style={{ alignSelf: "flex-end", width: 220, marginTop: 8 }}>
            <View style={[s.row, { justifyContent: "space-between" }]}><Text>Subtotal</Text><Text>{ttd(p.subtotalCents)}</Text></View>
            {p.vatCents ? <View style={[s.row, { justifyContent: "space-between" }]}><Text>VAT {p.vatRatePct}%</Text><Text>{ttd(p.vatCents)}</Text></View> : null}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, marginTop: 4, paddingTop: 4 }]}><Text style={s.bold}>Total (TTD)</Text><Text style={s.bold}>{ttd(p.totalCents)}</Text></View>
          </View>
          <Text style={s.h}>How to pay</Text>
          {p.paymentLink ? <Text>Pay online: {p.paymentLink}</Text> : null}
          {p.agency.bank ? (
            <View style={s.card}>
              <Text>Bank transfer to <Text style={s.bold}>{p.agency.bank.accountName}</Text></Text>
              <Text>{p.agency.bank.bank} · {p.agency.bank.branch}</Text>
              <Text>{p.agency.bank.accountType} account {p.agency.bank.accountNumber}</Text>
              <Text style={{ color: C.muted }}>Reference: {p.number ?? "invoice number"}</Text>
            </View>
          ) : null}
          <Text style={{ color: C.muted, marginTop: 8 }}>This invoice is for the agency's management fee only. Ad spend is paid by the client directly to Meta.</Text>
          {p.status === "paid" ? <Text style={{ color: C.green, marginTop: 8, fontSize: 14 }}>PAID — thank you</Text> : null}
        </View>
        <Footer left={`${p.agency.name ?? ""} · ${p.number ?? "draft"}`} />
      </Page>
    </Document>
  );
}
