# ΤΙΜΟΥΛΑ – σελίδες αγγελιών για δοκιμές

Συλλέχθηκαν 12/10/2026. Κάθε `NN_*.html` έχει δίπλα το `NN_*.url.txt` με το αρχικό link.
- AutoScout24: η σελίδα όπως τη σερβίρει ο server (τα δεδομένα είναι στο `<script id="__NEXT_DATA__">`).
- mobile.de: το DOM από πραγματικό browser, μετά τη φόρτωση (δεδομένα σε JSON-LD, `self.__next_f` και στη λίστα `<dt>/<dd>`).
Δεν είναι «Webpage, Complete» (χωρίς εικόνες/CSS), αλλά έχουν όλο το περιεχόμενο που χρειάζεται ο parser.

## Τι ελέγχει κάθε σελίδα

**01** · AutoScout24 · Subaru XV 2.0D Comfort, 11/2014, 178.000 km, €5.500  
Αναμενόμενο ταίριασμα: κατάλογος 30/10/2014, XV 2.0D COMFORT MT = 21.620,81 €, CO2 146 (ίδιο με την αγγελία).

**02** · mobile.de · Subaru Forester 2.0D 4x4 Active, 02/2017, 47.000 km, €17.990  
Η έκδοση «Active» δεν υπάρχει στον ελληνικό κατάλογο (TREND / TREND-DYNAMIC / DYNAMIC+NAVI): πρέπει να ρωτήσει. Χωρίς CO2 στην αγγελία.

**03** · AutoScout24 · Subaru Forester 2.0ie Mild-Hybrid Edition Sport 40, 07/2021, €24.840  
Καύσιμο δηλωμένο «Benzin»: το mild hybrid φαίνεται μόνο στον τίτλο. Πέφτει στο κενό καταλόγων 2020–2026.

**04** · mobile.de · Mercedes C 200 4MATIC Avantgarde (W206), 09/2022, €30.800  
Η αγγελία λέει «Verbrennungsmotor» και «Benzin»: το MHEV δεν φαίνεται πουθενά. Τιμή χωρίς ΦΠΑ 25.882 € (+19%).

**05** · AutoScout24 · Toyota RAV4 2.5 Hybrid Dynamic, 01/2020, €23.945  
Το CO2 (105) υπάρχει μόνο στο μπλοκ WLTP της σελίδας, όχι στο κανονικό πεδίο CO2.

**06** · mobile.de · BMW 330e Touring Sport Line, 10/2020, €27.480  
Plug-in δηλωμένο ως «Benzin» / «Verbrennungsmotor», χωρίς CO2: το PHEV αναγνωρίζεται μόνο από το «330e».

**07** · AutoScout24 · VW ID.3 Pure 45 kWh, 08/2021, €18.395  
Ηλεκτρικό. Τιμή χωρίς ΦΠΑ 15.202 €.

**08** · mobile.de · Ford Tourneo Courier Titanium Aut., Tageszulassung 08/2026, 9 km, €24.970  
Καινούργιο μεταφορικό μέσο (κάτω από 6 μήνες / 6.000 km). Τιμή χωρίς ΦΠΑ 20.983 €.

**09** · AutoScout24 · VW Passat Variant 2.0 TDI BMT R-Line, 12/2012, €2.500  
CO2 123 (NEDC). Η κλάση Euro δεν αναγράφεται.

**10** · AutoScout24 · BMW 320Cd Cabrio (E46), 04/2006, €13.900  
Euro 4. Το AutoScout24 βάζει το CO2 (167) στο μπλοκ «WLTP» ακόμα και για αυτοκίνητο του 2006: δεν δείχνει τον πραγματικό κύκλο μέτρησης.

**11** · mobile.de · Porsche Cayenne Turbo GT, 05/2023, 18.000 km, €178.500  
CO2 319, πολύ ακριβό. Παγίδα: πολλές αγγελίες «Cayenne 3.0 V6 Turbo» δεν είναι η έκδοση Turbo.

**12** · AutoScout24 · Mercedes 230 CE (C123), 08/1982, €18.500  
Ιστορικό, χωρίς CO2.

**13** · AutoScout24 · Genesis G70 Sport diesel, 11/2024, €29.979  
Η Genesis δεν είναι στη λίστα μελών του ΣΕΑΑ. CO2 178 μόνο στο μπλοκ WLTP.

**14** · AutoScout24 · Dodge Challenger R/T Blacktop 5.7, 12/2021, 1.591 km, €55.990  
CO2 319 μόνο στο μπλοκ WLTP. Τιμή χωρίς ΦΠΑ 47.050 €.

**15** · AutoScout24 · Skoda Octavia Combi 1.4 TSI iV (PHEV), 05/2021, €14.450 (σελίδα autoscout24.pl)  
Σελίδα στα πολωνικά, τιμή γραμμένη «€ 14 450». Τα autoscout24.pl/.se δείχνουν αγγελίες ΕΕ σε ευρώ, όχι PLN/SEK.

**16** · mobile.de · Subaru Outback 2.5i, 05/2012, έμπορος CH-5014 Gretzenbach, €15.900  
Πωλητής στην Ελβετία μέσα στο mobile.de: πρέπει να απορρίψει. Το autoscout24.ch μπλόκαρε με έλεγχο Cloudflare.

**17** · AutoScout24 · Σελίδα αποτελεσμάτων: Subaru XV diesel 2014–2015  
Πρέπει να δείξει «δεν είναι αγγελία».

**18** · AutoScout24 · VW T6 Transporter Kasten EcoProfi, 08/2018, €15.490  
Το AutoScout24 το βάζει στην κατηγορία «Sonstige»: το φορτηγό αναγνωρίζεται από μοντέλο/έκδοση.

## Συμπεράσματα για τους parsers

1. Το καύσιμο/τύπος κινητήρα της αγγελίας ΔΕΝ είναι αξιόπιστο για υβριδικά: MHEV και ακόμα και PHEV εμφανίζονται ως «Benzin» (03, 04, 06). Χρειάζεται δεύτερο σήμα (τίτλος, μοντέλο, ισχύς) και επιβεβαίωση από τον χρήστη.
2. AutoScout24: το CO2 είναι είτε στο `co2emissionInGramPerKmWithFallback` είτε μέσα στο `wltp` (05, 10, 13, 14). Να διαβάζονται και τα δύο. Η ύπαρξη του μπλοκ `wltp` δεν σημαίνει κύκλο WLTP (10: αυτοκίνητο του 2006).
3. mobile.de: η χώρα του πωλητή φαίνεται από τον ταχυδρομικό κώδικα (π.χ. «CH-5014») και πρέπει να ελέγχεται για τον κανόνα «μόνο ΕΕ» (16).
4. Καμία από τις 18 αγγελίες δεν έδειχνε VIN.
5. Τα autoscout24.pl/.se δείχνουν τιμές σε ευρώ· αγγελίες σε PLN/SEK δεν βρέθηκαν σε αυτά τα δύο sites.
6. Το AutoScout24 βάζει τα φορτηγάκια στην κατηγορία «Sonstige» (18).
