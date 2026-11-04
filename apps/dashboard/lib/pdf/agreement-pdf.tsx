import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { Footer, Header, s, C } from "./brand";

export function AgreementPdf(p: {
  agencyName: string;
  clientName: string;
  version: string;
  sections: { title: string; body: string }[];
  signature?: { name: string; imageDataUrl: string; signedAt: string; ip: string | null } | null;
}) {
  return (
    <Document title={`Service agreement — ${p.clientName}`} author={p.agencyName}>
      <Page size="A4" style={s.page}>
        <Header kicker={p.agencyName} title="Service agreement" subtitle={`${p.clientName} · ${p.version}`} />
        <View style={s.body}>
          {p.sections.map((sec) => (
            <View key={sec.title} wrap={false} style={{ marginBottom: 6 }}>
              <Text style={[s.bold, { marginTop: 6 }]}>{sec.title}</Text>
              <Text>{sec.body}</Text>
            </View>
          ))}
          <View style={[s.card, { marginTop: 16 }]} wrap={false}>
            <Text style={s.h}>Signed by the client</Text>
            {p.signature ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={p.signature.imageDataUrl} style={{ width: 180, height: 60, objectFit: "contain" }} />
                <Text style={s.bold}>{p.signature.name}</Text>
                <Text style={{ color: C.muted }}>Signed electronically on {p.signature.signedAt} (AST){p.signature.ip ? ` from IP ${p.signature.ip}` : ""}</Text>
              </>
            ) : (
              <Text style={{ color: C.muted }}>Not signed yet</Text>
            )}
          </View>
        </View>
        <Footer left={`${p.agencyName} · agreement ${p.version}`} />
      </Page>
    </Document>
  );
}
