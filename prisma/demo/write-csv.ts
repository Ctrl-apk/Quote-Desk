import { writeFileSync } from "node:fs";
import path from "node:path";
import { pastQuotesCsv } from "../seed-data";

const target = path.resolve(__dirname, "past-quotes-demo.csv");
writeFileSync(target, pastQuotesCsv());
console.log(`Wrote ${target}`);
