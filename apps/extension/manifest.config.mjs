/**
 * Builds manifest.json and _locales from the product constant, so the name
 * lives in one place (packages/core/src/config/product.ts).
 */
export function buildManifest({ product, version, e2e = false }) {
  const manifest = {
    manifest_version: 3,
    name: '__MSG_appName__',
    short_name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'el',
    version,
    minimum_chrome_version: '116',
    action: {
      default_popup: 'popup/index.html',
      default_title: '__MSG_appName__',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    },
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    background: { service_worker: 'background.js', type: 'module' },
    // activeTab: the listing is read only after the client clicks the icon, so no
    // permanent access to mobile.de / AutoScout24 is needed.
    permissions: ['activeTab', 'scripting', 'storage'],
    // Requested only if the client turns on the (off by default) car.gr page reader.
    optional_host_permissions: ['https://www.car.gr/*'],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  if (e2e) {
    // Test build only: lets automated tests inject without a real toolbar click.
    manifest.host_permissions = ['https://*.mobile.de/*', 'https://*.autoscout24.de/*', 'https://*.autoscout24.pl/*', 'https://*.autoscout24.nl/*', 'https://*.autoscout24.at/*'];
    manifest.name = `${product.name} (E2E)`;
  }
  const locales = {
    el: { appName: { message: product.name }, appDescription: { message: product.description.el } },
    en: { appName: { message: product.name }, appDescription: { message: product.description.en } },
  };
  return { manifest, locales };
}
