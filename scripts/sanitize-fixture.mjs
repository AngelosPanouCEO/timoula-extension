#!/usr/bin/env node
/**
 * Copy saved listing pages into test fixtures with personal data removed
 * (phone numbers, e-mail addresses, contact person names, street addresses,
 * WhatsApp links, licence plates in partner URLs). Structure is preserved so
 * the parsers see the same JSON shapes.
 *
 * Usage: node scripts/sanitize-fixture.mjs <input.html> <output.html>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/sanitize-fixture.mjs <input.html> <output.html>');
  process.exit(1);
}
let html = readFileSync(input, 'utf8');

// JSON string values for these keys, in plain JSON ("k":"v") and escaped inside JS strings (\"k\":\"v\").
const KEYS = ['contactName', 'street', 'streetAddress', 'address1', 'formattedNumber', 'callTo', 'number', 'uri', 'whatsappNumber', 'email', 'offerReference', 'partnerUrl', 'sellerName', 'name'];
const PRESERVE_NAME = /^(Subaru|Mercedes|BMW|Toyota|Volkswagen|Ford|Porsche|Genesis|Dodge|Skoda|Škoda|Audi|VW|mobile\.de|AutoScout24)/i;
for (const key of KEYS) {
  const plain = new RegExp(`("${key}"\\s*:\\s*")((?:[^"\\\\]|\\\\.)*)(")`, 'g');
  const escaped = new RegExp(`(\\\\"${key}\\\\"\\s*:\\s*\\\\")((?:[^"\\\\]|\\\\(?!"))*)(\\\\")`, 'g');
  const replace = (_m, a, v, b) => {
    if (key === 'name' && (PRESERVE_NAME.test(v) || !/\s/.test(v))) return a + v + b;
    if (key === 'uri' && !/^(tel:|https:\/\/wa\.me)/.test(v)) return a + v + b;
    return a + 'REDACTED' + b;
  };
  html = html.replace(plain, replace).replace(escaped, replace);
}
// Free-text phone numbers and e-mails anywhere else (descriptions, meta tags).
html = html
  .replace(/\+\d{2}[\d\s()\-/.]{7,}\d/g, '+00 000 0000')
  .replace(/\b0\d{2,4}[\s\-/]\d{3,}[\s\-]?\d{0,4}\b/g, '000 0000')
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'redacted@example.invalid')
  .replace(/wa\.me\/\d+/g, 'wa.me/0');
writeFileSync(output, html);
console.log(`${input} → ${output} (${(html.length / 1024).toFixed(0)} KB)`);
