# TimePilot – Zeiterfassung mit Browser- und Datenbankmodus

TimePilot ist eine deutschsprachige Zeiterfassungs-App mit identischem Funktionsumfang in zwei Betriebsarten:

- **Browser-Daten:** lokale Einzelplatznutzung ohne Server; Speicherung im Browserprofil.
- **Datenbank-Server:** eigene Registrierung mit E-Mail und Passwort; benutzergetrennte Speicherung in PostgreSQL.

Der Betriebsmodus wird beim App-Start ausgewählt und kann später in den Einstellungen gewechselt werden.

## Funktionsumfang

- Einstempeln, Pausenbeginn, Pausenende und Ausstempeln
- Live-Anzeige der Nettoarbeitszeit
- manuelle Arbeitszeiteinträge mit beliebig vielen Pausenintervallen inklusive Uhrzeiten
- Monatskalender mit Arbeitstagen, Wochenenden, Feiertagen und Abwesenheiten
- Feiertage nach deutschem Bundesland über OpenHolidays API mit Offline-Fallback
- datierte Arbeitspläne mit Sollstunden pro Wochentag
- Arbeitspläne anlegen, bearbeiten und jederzeit löschen
- Zeiträume ohne Arbeitsplan werden automatisch mit einem Tagessoll von `0:00` Stunden bewertet
- Start der Live-Zeiterfassung nur bei vorhandenem, gültigem Arbeitsplan
- Urlaub, Krankheit und Überstundenabbau
- Urlaub kann nicht über Tage mit vorhandenen Arbeitszeiten gelegt werden
- an Urlaubstagen sind Live- und manuelle Arbeitszeiteinträge gesperrt
- Jahresurlaubskontingent, gebuchte Urlaubstage und Resturlaub
- sofortige Reduzierung des Zeitkontos bei gebuchtem Überstundenabbau
- bestätigungspflichtige Vorschläge für Überstundenabbau
- Tagesnotizen
- PDF-Monatsbericht mit exakten Arbeits- und Pausenzeiten
- JSON-Backup und Wiederherstellung in beiden Speicherarten
- installierbare PWA im Produktionsbetrieb
- E-Mail/Passwort-Registrierung ohne externen Authentifizierungsanbieter

## Schnellstart ohne Datenbank

Voraussetzungen:

- Node.js ab Version 22.12, empfohlen Node.js 24 LTS
- npm
- aktueller Chrome, Edge, Firefox oder Safari

```bash
npm install
npm run dev
```

Anschließend `http://localhost:5173` öffnen und **Browser-Daten** auswählen.

Windows kann alternativ `start-windows.cmd`, macOS/Linux `./start.sh` verwenden.

## Schnellstart mit PostgreSQL

**Windows ohne vorinstallierte Software:** ZIP entpacken und [install-local-windows.cmd](install-local-windows.cmd) als Administrator starten. Server und lokale PostgreSQL-Datenbank laufen danach ohne offene Fenster als Windows-Dienste. Anleitung: [WINDOWS_LOCAL_SETUP.md](WINDOWS_LOCAL_SETUP.md). Prüfbericht: [DATABASE_READINESS.md](DATABASE_READINESS.md).

Die ausführliche Einrichtung steht in [DATABASE_SETUP.md](DATABASE_SETUP.md).

Lokale Entwicklungsvariante:

```bash
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

docker compose up -d
npm install
npm run dev:full
```

Danach `http://localhost:5173` öffnen, **Datenbank-Server** auswählen und als API-Adresse eintragen:

```text
http://localhost:3001/api
```

Beim ersten Start wird direkt in TimePilot ein Konto mit Anzeigename, E-Mail-Adresse und Passwort angelegt.

## Komplettbetrieb mit Docker

```bash
cp .env.example .env
# In .env zuerst POSTGRES_PASSWORD durch ein starkes eigenes Passwort ersetzen.
docker compose -f docker-compose.full.yml up --build -d
```

Danach ist die komplette App unter `http://localhost:3001` erreichbar.

## Bedienregeln

### Arbeitspläne

Arbeitspläne besitzen einen Gültigkeitszeitraum und dürfen sich nicht überschneiden. Jeder Plan kann bearbeitet oder gelöscht werden – auch der letzte Plan.

Für Tage ohne gültigen Arbeitsplan gilt:

- Tagessoll: `0:00` Stunden
- vorhandene historische oder manuelle Arbeitszeit bleibt sichtbar
- die Live-Zeiterfassung kann nicht neu gestartet werden

### Kalender und Abwesenheitszeitraum

Beim Anklicken eines Kalendertages wird zuerst das Feld **Von** im Abwesenheitsformular gesetzt. Der nächste Kalenderklick setzt **Bis**. Danach beginnt die Auswahl wieder beim Feld **Von**.

### Urlaub und Arbeitszeiten

- Bestehende Arbeitszeiten verhindern einen Urlaubseintrag für denselben Tag.
- Eingetragener Urlaub verhindert neue Live- und manuelle Arbeitszeiten.
- Diese Regel wird im Servermodus zusätzlich serverseitig validiert.

### Überstundenabbau

Überstundenabbau erhält keine normale Abwesenheitsgutschrift. Stattdessen wird das Tagessoll des gebuchten Tages vom Zeitkonto abgezogen. Zukünftig gebuchte Abbautage reduzieren den angezeigten verfügbaren Saldo sofort.

### PDF-Export

Der Monatsbericht enthält:

- Monatskalender
- Soll-, Arbeits-, Pausen- und Saldozeiten
- Arbeitsbeginn und Arbeitsende
- einzelne Pausenintervalle mit Uhrzeiten
- Feiertage und Abwesenheiten
- Überstundenabbau
- Tagesbemerkungen

Die PDF-Datei wird mit jsPDF direkt im Browser erzeugt und funktioniert deshalb in beiden Speicherarten identisch.

## Wichtige npm-Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | nur Frontend; Browsermodus ohne Datenbank |
| `npm run dev:full` | Frontend und API gemeinsam für lokale Entwicklung |
| `npm run dev:server` | nur API mit automatischem Neustart |
| `npm run build` | TypeScript prüfen und Produktionsfrontend bauen |
| `npm start` | API starten und vorhandenes `dist/` ausliefern |
| `npm run db:migrate` | SQL-Migrationen anwenden |
| `npm run db:reset` | alle Benutzer und Daten nach Bestätigung löschen |
| `npm run check` | TypeScript-Prüfung und Servertests |

## Architektur

```text
React + TypeScript + Vite
          │
          ├── BrowserDataStore ── localStorage
          │
          └── ServerDataStore ── HTTP/JSON API
                                   │
                                   ├── eigene E-Mail/Passwort-Authentifizierung
                                   ├── serverseitige Sitzungen
                                   └── PostgreSQL
```

Die Oberfläche arbeitet in beiden Modi mit demselben `AppData`-Modell. Kalender, Zeitberechnung, Geschäftsregeln, PDF-Export und JSON-Import sind daher unabhängig von der Speicherart.

Im Servermodus werden die Daten normalisiert gespeichert:

- Benutzer und Sitzungen
- Zeitereignisse
- Abwesenheiten
- Arbeitspläne und Wochentage
- Tagesnotizen
- Feiertags-Cache

Ein Speichervorgang läuft innerhalb einer Datenbanktransaktion. Eine Revisionsnummer verhindert, dass eine ältere Sitzung neuere Daten unbemerkt überschreibt.

## Authentifizierung

- Registrierung direkt in TimePilot mit E-Mail-Adresse und Passwort
- Passwörter mit Node.js `scrypt` und individuellem Salt
- zufällige Sitzungstoken; in PostgreSQL liegt nur der SHA-256-Hash
- Sitzungsdauer standardmäßig 30 Tage
- einfaches Login- und Registrierungslimit
- vollständige Datentrennung über `user_id`

Für einen öffentlich erreichbaren Produktivbetrieb sollten zusätzlich HTTPS, E-Mail-Verifikation, Passwort-Wiederherstellung und ein zentraler Rate-Limiter eingerichtet werden.

## Projektstruktur

```text
src/
  App.tsx                 Startmodus, Registrierung, Login und Synchronisierung
  TimePilotApp.tsx        vollständige Fachoberfläche und Geschäftsregeln
  styles.css              modernes responsives Dashboard-Design
  lib/data-store.ts       Browser- und Serveradapter
  lib/time.ts             Arbeitszeit-, Pausen-, Soll- und Saldoberechnung
  lib/pdf.ts              PDF-Monatsbericht mit Zeitfenstern
server/
  migrations/             PostgreSQL-Schema
  src/index.mjs           HTTP-API und statische Auslieferung
  src/auth.mjs            Passwort- und Sitzungslogik
  src/data.mjs            Laden und transaktionales Speichern
  src/validation.mjs      serverseitige Daten- und Konfliktvalidierung
```

## Weitere Anleitungen

- [INSTALLATION.md](INSTALLATION.md) – Installation und Funktionstest
- [DATABASE_SETUP.md](DATABASE_SETUP.md) – PostgreSQL, Docker, Backups und Produktivbetrieb
- [CHANGELOG.md](CHANGELOG.md) – Änderungen der aktuellen Version
