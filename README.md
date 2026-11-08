# Karteikarten

Persönliche Karteikarten-App fürs iPhone (PWA): eigene Stapel, Karten mit Bild, Lernen mit Spaced Repetition, Import aus Text (z. B. von Claude), Backup per Datei. Läuft offline, alle Daten bleiben lokal auf dem Gerät.

**App:** https://jannik63688.github.io/karteikarten/

## Aufs iPhone
Link in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.

## Lernpaket
`packs/sct.json` enthält das SCT-Lernpaket (150 Karten, nur `cards` und `sources`). Es wird in der App unter „Karten hinzufügen“ geladen; feste IDs sorgen dafür, dass erneutes Laden Karten aktualisiert, ohne den Lernfortschritt zu verlieren.

## Technik
- Reines HTML/CSS/JavaScript ohne Build-Schritt
- IndexedDB für Karten und Bilder, Service Worker für Offline-Betrieb
- Lernplan nach SM-2 (wie Anki) mit Lernschritten

Bei Änderungen an Dateien `VERSION` in `sw.js` erhöhen, damit installierte Apps das Update bekommen.
