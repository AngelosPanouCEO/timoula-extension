import { useEffect, useState } from 'preact/hooks';
import { PRODUCT, type Lang } from '@timoula/core';
import { loadSettings } from '../../shared/settings';

/**
 * Phase 1 privacy notice (everything stays on the device). The full privacy
 * policy and terms for accounts are part of phase 2 and need legal review.
 */
const TEXT: Record<Lang, { title: string; body: string[] }> = {
  el: {
    title: `Απόρρητο — ${PRODUCT.name}`,
    body: [
      `Το ${PRODUCT.name} διαβάζει την αγγελία που έχεις ανοιχτή μόνο όταν πατάς το εικονίδιό του. Δεν διαβάζει άλλες σελίδες και δεν τρέχει στο παρασκήνιο.`,
      'Από την αγγελία κρατάμε μόνο τα τεχνικά στοιχεία του αυτοκινήτου, την τιμή, τη χώρα και τον τύπο πωλητή (έμπορος/ιδιώτης), τη διεύθυνση της αγγελίας και τη διεύθυνση της κύριας φωτογραφίας. Δεν κρατάμε ονόματα, τηλέφωνα ή κείμενα πωλητών.',
      'Όλοι οι υπολογισμοί, οι σημειώσεις και οι ρυθμίσεις αποθηκεύονται μόνο στον browser αυτού του υπολογιστή (IndexedDB και chrome.storage). Στη Φάση 1 τίποτα δεν αποστέλλεται σε διακομιστή του ΤΙΜΟΥΛΑ ή σε τρίτους.',
      'Το VIN, αν το καταχωρίσεις, θεωρείται προσωπικό δεδομένο και μένει μόνο τοπικά.',
      'Το κουμπί αναζήτησης car.gr απλώς ανοίγει μια σελίδα του car.gr. Η ανάγνωση τιμών από τη σελίδα car.gr είναι απενεργοποιημένη εξ ορισμού και ζητά ξεχωριστή άδεια αν την ενεργοποιήσεις.',
      'Μπορείς οποιαδήποτε στιγμή να εξάγεις όλα τα δεδομένα σου (JSON) ή να τα διαγράψεις οριστικά από τις Ρυθμίσεις → Τα δεδομένα μου. Η απεγκατάσταση της επέκτασης διαγράφει επίσης όλα τα δεδομένα.',
    ],
  },
  en: {
    title: `Privacy — ${PRODUCT.name}`,
    body: [
      `${PRODUCT.name} reads the listing you have open only when you click its icon. It does not read other pages and does not run in the background.`,
      'From a listing we keep only the car’s technical data, the price, the country and seller type (dealer/private), the listing address and the main photo address. We do not keep seller names, phone numbers or descriptions.',
      `All calculations, notes and settings are stored only in this browser on this computer (IndexedDB and chrome.storage). In phase 1 nothing is sent to a ${PRODUCT.name} server or to third parties.`,
      'A VIN you enter is treated as personal data and stays local.',
      'The car.gr search button only opens a car.gr page. Reading prices from the car.gr page is off by default and asks for a separate permission if you turn it on.',
      'You can export all your data (JSON) or delete it permanently at any time from Settings → My data. Uninstalling the extension also deletes all data.',
    ],
  },
};

export function App() {
  const [lang, setLang] = useState<Lang | null>(null);
  useEffect(() => {
    void loadSettings().then((s) => setLang(s.lang));
  }, []);
  if (!lang) return null;
  const x = TEXT[lang];
  document.title = x.title;
  document.documentElement.lang = lang;
  return (
    <div class="page-wrap prose">
      <h1>{x.title}</h1>
      {x.body.map((p) => (
        <p>{p}</p>
      ))}
      <p>
        <a href="../settings/index.html">{lang === 'el' ? 'Ρυθμίσεις' : 'Settings'}</a> · <a href="../history/index.html">{lang === 'el' ? 'Ιστορικό' : 'History'}</a>
      </p>
    </div>
  );
}
