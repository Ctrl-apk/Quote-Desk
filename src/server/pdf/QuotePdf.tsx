import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SELLER_NAME, SELLER_PLACE, type PdfContent } from "@/lib/quote/pdf-content";

// The built-in PDF fonts have no rupee glyph, so amounts are labelled INR rather than risk a wrong character.
const GREEN = "#1f4d3a";
const COPPER = "#9a4f24";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1d1b16", backgroundColor: "#ffffff" },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: GREEN, paddingBottom: 10, marginBottom: 18 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: GREEN },
  muted: { color: "#5c564a" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COPPER, textAlign: "right" },
  grid: { flexDirection: "row", marginBottom: 18 },
  col: { flex: 1 },
  label: { fontSize: 8, color: "#5c564a", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 11, marginBottom: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e4dcc8", paddingVertical: 6 },
  th: { flexDirection: "row", backgroundColor: GREEN, color: "#ffffff", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  c1: { width: "28%", paddingLeft: 6 },
  cn: { width: "18%", textAlign: "right", paddingRight: 6 },
  base: { backgroundColor: "#faf6ec", fontFamily: "Helvetica-Bold" },
  bl: { width: "34%", paddingLeft: 6 },
  bn: { width: "22%", textAlign: "right", paddingRight: 6 },
  strong: { fontFamily: "Helvetica-Bold" },
  note: { marginTop: 6, fontSize: 8, color: "#5c564a" },
  terms: { marginTop: 22 },
  term: { marginBottom: 3 },
  foot: { position: "absolute", bottom: 28, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#5c564a" },
});

export function QuotePdf({ c }: { c: PdfContent }) {
  return (
    <Document title={`Quotation ${c.reference}`} author={SELLER_NAME}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View><Text style={s.brand}>{SELLER_NAME}</Text><Text style={s.muted}>{SELLER_PLACE}</Text></View>
          <View><Text style={s.title}>QUOTATION</Text><Text style={{ textAlign: "right" }}>{c.reference}</Text></View>
        </View>
        <View style={s.grid}>
          <View style={s.col}><Text style={s.label}>To</Text><Text style={s.value}>{c.customer}</Text><Text style={s.label}>Part</Text><Text style={s.value}>{c.part}</Text></View>
          <View style={s.col}><Text style={s.label}>Material</Text><Text style={s.value}>{c.material}</Text><Text style={s.label}>Issued / valid until</Text><Text style={s.value}>{c.issuedOn} / {c.validUntil}</Text></View>
        </View>
        <View style={s.th}>
          <Text style={s.c1}>Annual volume</Text><Text style={s.cn}>Price (INR)</Text><Text style={s.cn}>{c.gstLabel}</Text><Text style={s.cn}>With GST</Text><Text style={s.cn}>Annual (excl. GST)</Text>
        </View>
        {c.rows.map((r) => (
          <View key={r.volume} style={r.base ? [s.tr, s.base] : s.tr}>
            <Text style={s.c1}>{r.volume}</Text><Text style={s.cn}>{r.price}</Text><Text style={s.cn}>{r.gst}</Text><Text style={s.cn}>{r.priceWithGst}</Text><Text style={s.cn}>{r.annual}</Text>
          </View>
        ))}
        <View wrap={false} style={{ marginTop: 20 }}>
          <Text style={[s.label, { marginBottom: 6 }]}>Cost breakup per piece (INR)</Text>
          <View style={s.th}>
            <Text style={s.bl}> </Text>
            {c.breakup.columns.map((col) => <Text key={col.volume} style={s.bn}>{col.volume}</Text>)}
          </View>
          {c.breakup.lines.map((l) => (
            <View key={l.label} style={l.strong ? [s.tr, s.strong] : s.tr}>
              <Text style={s.bl}>{l.label}</Text>
              {l.values.map((v, i) => <Text key={i} style={s.bn}>{v}</Text>)}
            </View>
          ))}
          <Text style={s.note}>{c.breakup.note}</Text>
        </View>
        <View style={s.terms}>
          <Text style={[s.label, { marginBottom: 6 }]}>Terms</Text>
          {c.terms.map((t) => <Text key={t} style={s.term}>- {t}</Text>)}
        </View>
        <View style={s.foot} fixed><Text>Prepared by {c.preparedBy}</Text><Text>{SELLER_NAME}, {SELLER_PLACE}</Text></View>
      </Page>
    </Document>
  );
}
