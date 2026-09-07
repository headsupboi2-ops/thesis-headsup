#!/usr/bin/env node
/**
 * start-lan.js — start Expo bound to this PC's REAL LAN address.
 *
 * Why this exists: Windows keeps 169.254.x.x "APIPA" addresses on disconnected
 * adapters (Ethernet, virtual Wi-Fi). Expo sometimes picks one of those for the
 * QR code, producing a URL the phone can never reach — the QR fails while
 * typing exp://<real-ip>:8081 by hand works fine.
 *
 * So we detect the real address ourselves and pin it:
 *   REACT_NATIVE_PACKAGER_HOSTNAME -> makes the QR / dev-server URL correct
 *   EXPO_PUBLIC_API_URL            -> points the app at the Flask backend
 *
 * Both follow DHCP automatically, so switching Wi-Fi or hotspot no longer
 * requires hand-editing .env. An EXPO_PUBLIC_API_URL already set in the real
 * environment still wins (see below), which keeps tunnel/ngrok setups working.
 */
const os = require('os');
const { spawn } = require('child_process');

const BACKEND_PORT = 5000;

/**
 * Pick this machine's real IPv4 LAN address.
 * Skips loopback and 169.254.x.x link-local, and prefers Wi-Fi/hotspot
 * adapters over wired ones since the phone is normally on Wi-Fi.
 */
function detectLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue; // APIPA: no real link
      candidates.push({ name, address: addr.address });
    }
  }
  if (candidates.length === 0) return null;

  const wifi = candidates.find((c) => /wi-?fi|wlan|wireless/i.test(c.name));
  return (wifi || candidates[0]).address;
}

const ip = detectLanIp();

if (!ip) {
  console.error('\n  No usable LAN address found (only loopback/169.254.*).');
  console.error('  Connect to Wi-Fi or a phone hotspot, then try again.\n');
  process.exit(1);
}

// .env does not override variables already present in the environment, so
// setting these here takes priority over the values written in mobile/.env.
const env = { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ip };
if (!process.env.EXPO_PUBLIC_API_URL) {
  env.EXPO_PUBLIC_API_URL = `http://${ip}:${BACKEND_PORT}`;
}

console.log(`\n  LAN address detected: ${ip}`);
console.log(`  QR / dev server : exp://${ip}:8081`);
console.log(`  Backend API     : ${env.EXPO_PUBLIC_API_URL}`);
console.log('\n  Make sure the Flask backend is running on this PC.\n');

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: true, // required for npx resolution on Windows
});

child.on('exit', (code) => process.exit(code ?? 0));
