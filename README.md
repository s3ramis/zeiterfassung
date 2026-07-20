# TimePilot – lokale Zeiterfassung

TimePilot ist ein lokal startbares MVP für persönliche Arbeitszeiterfassung. Die Anwendung läuft als React-Web-App im Browser und speichert die Daten im lokalen Browserprofil.

## Enthaltene Funktionen

- Einstempeln, Pausenbeginn, Pausenende und Ausstempeln
- Live-Anzeige der Nettoarbeitszeit ohne Pausen
- Speicherung aller Stempelereignisse nach Datum
- Monatskalender mit Arbeitstagen, Wochenenden und Feiertagen
- Feiertage nach deutschem Bundesland über OpenHolidays API
- Offline-Fallback für bundesweite Feiertage
- Arbeitspläne mit täglicher Sollzeit und Gültigkeitszeitraum
- Überstunden- und Minusstundenberechnung
- Urlaub, Krankheit und Überstundenausgleich von/bis Datum
- Tagesnotizen
- Jahresurlaubskontingent und automatische Resturlaubsberechnung
- Vorschlag eines Ausgleichstags auf Basis des Zeitguthabens
- Manuelle Bestätigung vor Eintragung des Ausgleichstags
- Manuelle Korrektur von Start, Ende und Pause pro Tag
- PDF-Monatsexport
- JSON-Datensicherung und Wiederherstellung
- Installierbare PWA im Produktionsmodus

## Schnellstart

Voraussetzung: Node.js 22.12 oder neuer. Empfohlen wird Node.js 24 LTS.

```bash
npm install
npm run dev
```

Alternativ unter Windows `start-windows.cmd` doppelt anklicken oder unter macOS/Linux `./start.sh` ausführen.

Danach im Browser öffnen:

```text
http://localhost:5173
```

Die ausführliche Anleitung steht in [INSTALLATION.md](./INSTALLATION.md).

## Produktionsbuild testen

```bash
npm run build
npm run preview
```

Danach:

```text
http://localhost:4173
```

Im Produktionsbuild wird der Service Worker registriert. Dadurch kann die Anwendung in unterstützten Browsern als App installiert und nach dem ersten Laden weitgehend offline geöffnet werden.

## Datenspeicherung

Die Daten liegen in `localStorage` des verwendeten Browserprofils. Das ist für einen lokalen Einzelbenutzer-Test geeignet, aber nicht für eine produktive Mehrbenutzerlösung.

Regelmäßig unter **Einstellungen → JSON-Backup exportieren** sichern.

Beim Löschen von Browserdaten, Wechsel des Browserprofils oder Wechsel des Rechners gehen lokale Daten ohne Backup verloren.

## Feiertage

Die App ruft Feiertage über folgende API ab:

```text
https://openholidaysapi.org/PublicHolidays
```

Die Ergebnisse werden nach Jahr und Bundesland lokal zwischengespeichert. Ist die API nicht erreichbar, verwendet die App einen Offline-Fallback mit bundesweiten Feiertagen. Regionale Feiertage fehlen dann, bis die API wieder erreichbar ist.

## Projektstruktur

```text
src/App.tsx            Oberfläche und Anwendungslogik
src/lib/time.ts        Zeit-, Soll- und Saldoberechnung
src/lib/holidays.ts    Feiertags-API und Offline-Fallback
src/lib/pdf.ts         PDF-Monatsbericht
src/lib/storage.ts     lokale Speicherung und Backup
src/lib/date.ts        Datumsfunktionen
src/styles.css         responsive Oberfläche
public/sw.js           einfacher Service Worker
```

## Wichtige Einschränkungen des MVP

- Einzelbenutzer und ein Browserprofil
- Keine Benutzeranmeldung
- Keine zentrale Datenbank oder Synchronisierung zwischen Geräten
- Keine halben Urlaubstage
- Keine automatische gesetzliche Pausenprüfung
- Keine revisionssichere oder manipulationsgeschützte Historie
- Keine Prüfung auf arbeitsrechtliche oder tarifvertragliche Vorgaben

Für einen produktiven Firmenbetrieb sollte als nächster Schritt ein Backend mit PostgreSQL, Anmeldung, Rollen, Audit-Log, Backups und serverseitigem PDF-Export ergänzt werden.
