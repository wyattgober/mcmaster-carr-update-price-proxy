/**
 * Test that the McMaster PFX and password load correctly in Node.
 * Run from project root: node scripts/check-cert.js
 * Loads .env from project root (no extra deps).
 */

const fs = require('fs');
const path = require('path');
const tls = require('tls');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const certPath = process.env.MCMASTER_CERT_PATH || path.join(root, 'Certificates', 'certificate.pfx');
const passphrase = process.env.MCMASTER_CERT_PASSWORD;

if (!passphrase) {
  console.error('Set MCMASTER_CERT_PASSWORD in .env');
  process.exit(1);
}

if (!fs.existsSync(certPath)) {
  console.error('Cert file not found:', certPath);
  process.exit(1);
}

const pfx = fs.readFileSync(certPath);
console.log('PFX size:', pfx.length, 'bytes');

try {
  const ctx = tls.createSecureContext({ pfx, passphrase });
  console.log('OK: Certificate loaded successfully. Node accepts this PFX and password.');
} catch (e) {
  console.error('Failed to load PFX:', e.message);
  if (/wrong pass phrase|bad decrypt|mac verify failure/i.test(e.message)) {
    console.error('→ Likely cause: wrong MCMASTER_CERT_PASSWORD. Check for typos and extra spaces.');
  }
  if (/Unsupported PKCS12|PKCS12/i.test(e.message)) {
    console.error('→ Try re-exporting the PFX for Node:');
    console.error('  openssl pkcs12 -in Certificates/certificate.pfx -export -out Certificates/certificate-node.pfx -passin pass:OLD -passout pass:NEW');
    console.error('  Then set MCMASTER_CERT_PATH=./Certificates/certificate-node.pfx and MCMASTER_CERT_PASSWORD=NEW');
  }
  process.exit(1);
}
