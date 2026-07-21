# Zeiterfassung mit Browser- und Datenbankmodus

Beim Start kann zwischen zwei technisch getrennten Speicherarten gewählt werden. Optional kann die Auswahl auf dem Gerät gespeichert werden:

- **Browser-Daten:** funktioniert ohne Server und speichert ausschließlich im aktuellen Browserprofil.
- **Datenbank-Server:** Anmeldung mit eigener E-Mail-Adresse und Passwort; alle Daten werden benutzergetrennt in PostgreSQL gespeichert.

Beide Modi verwenden dieselbe Oberfläche, dieselbe Berechnungslogik und denselben Funktionsumfang.

## Enthaltene Funktionen

- Einstempeln, Pausenbeginn, Pausenende und Ausstempeln
- Live-Anzeige der Nettoarbeitszeit
- manuelle Zeiteinträge und Korrekturen
- Tagesnotizen
- Monatskalender mit Arbeitstagen, Wochenenden und Feiertagen
- Feiertage nach deutschem Bundesland über OpenHolidays API mit Offline-Fallback
- datierte Arbeitspläne mit täglicher Sollstundenverteilung
- Über- und Minusstundenberechnung
- Urlaub, Krankheit und Überstundenausgleich
- Jahresurlaubskontingent und Resturlaub
- bestätigungspflichtige Vorschläge für Überstundenausgleich
- PDF-Export des ausgewählten Monats
- JSON-Backup und Wiederherstellung in beiden Speicherarten
- installierbare PWA im Produktionsbetrieb
- E-Mail/Passwort-Registrierung ohne externen Authentifizierungsanbieter

## Schnellstart ohne Datenbank

Voraussetzungen:

- Node.js 22.12 oder neuer; empfohlen Node.js 24 LTS
- npm
- moderner Browser

```bash
npm install
npm run dev
```

Anschließend `http://localhost:5173` öffnen und **Browser-Daten** auswählen.

Windows kann alternativ `start-windows.cmd`, macOS/Linux `./start.sh` verwenden.

## Schnellstart mit PostgreSQL

Die ausführliche Anleitung steht in [DATABASE_SETUP.md](DATABASE_SETUP.md).

Kurzfassung für die lokale Entwicklung:

```bash
cp .env.example .env
# Windows: copy .env.example .env

docker compose up -d
npm install
npm run dev:full
```

Danach `http://localhost:5173` öffnen, **Datenbank-Server** auswählen und als API-Adresse verwenden:

```text
http://localhost:3001/api
```

Beim ersten Aufruf wird über die Oberfläche ein Konto mit Anzeigename, E-Mail-Adresse und Passwort angelegt.

## Komplettbetrieb mit Docker

Diese Variante baut das Frontend und startet App-Server und PostgreSQL gemeinsam:

```bash
cp .env.example .env
docker compose -f docker-compose.full.yml up --build
```

Danach `http://localhost:3001` öffnen. Die Standard-API-Adresse lautet dort automatisch `http://localhost:3001/api`.

## Wichtige npm-Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | nur Frontend; Browser-Modus ohne Datenbank |
| `npm run dev:full` | Frontend und API für lokale Entwicklung |
| `npm run dev:server` | nur API mit automatischem Neustart |
| `npm run build` | TypeScript prüfen und Produktionsfrontend bauen |
| `npm start` | API starten und vorhandenes `dist/` ausliefern |
| `npm run db:migrate` | ausstehende SQL-Migrationen anwenden |
| `npm run db:reset` | alle Benutzer und Daten nach Bestätigung löschen |
| `npm run check` | TypeScript- und Servertests ausführen |

Der Server führt ausstehende Migrationen auch bei jedem Start automatisch aus.

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

Die Oberfläche arbeitet immer mit demselben `AppData`-Modell. Die beiden Adapter in `src/lib/data-store.ts` kapseln die Speicherart. Dadurch bleiben Kalender, Berechnungen, PDF-Export und JSON-Import unabhängig vom gewählten Speicher.

Im Servermodus werden die Daten nicht als einzelner JSON-Blob gespeichert. PostgreSQL verwendet getrennte Tabellen für:

- Benutzer und Sitzungen
- Zeitereignisse
- Abwesenheiten
- Arbeitspläne und Wochentage
- Tagesnotizen
- Feiertags-Cache

Ein Speichervorgang ersetzt den konsistenten Benutzerstand innerhalb einer Datenbanktransaktion. Eine Revisionsnummer verhindert, dass eine ältere Browser-Sitzung neuere Serverdaten unbemerkt überschreibt.

## Authentifizierung

- Registrierung erfolgt direkt bei TimePilot mit E-Mail-Adresse und Passwort.
- Passwörter werden mit Node.js `scrypt` und individuellem Salt gehasht.
- Sitzungs-Token werden zufällig erzeugt; in PostgreSQL liegt nur der SHA-256-Hash des Tokens.
- Sitzungen laufen standardmäßig nach 30 Tagen ab.
- Registrierung und Login besitzen ein einfaches serverseitiges In-Memory-Versuchslimit.
- Konten und Fachdaten sind über `user_id` voneinander getrennt.

Die App versendet derzeit keine Bestätigungs- oder Passwort-zurücksetzen-E-Mails. Für einen öffentlich erreichbaren Produktivbetrieb sollten zusätzlich TLS, ein zentraler Rate-Limiter am Reverse Proxy, E-Mail-Verifikation und ein sicherer Wiederherstellungsprozess ergänzt werden.

## Datenübernahme zwischen den Modi

1. In **Einstellungen → Datensicherung** ein JSON-Backup exportieren.
2. Speichermodus wechseln.
3. Im anderen Modus das Backup importieren.
4. Im Servermodus den Synchronisierungsstatus am unteren Fensterrand kontrollieren.

## PDF-Export

Der Monatsbericht wird im Browser mit jsPDF erzeugt. Deshalb funktioniert der PDF-Export in beiden Speicherarten identisch und benötigt keinen zusätzlichen PDF-Dienst auf dem Server.

## Projektstruktur

```text
src/
  App.tsx                 Startmodus, Login und Synchronisierung
  TimePilotApp.tsx        vollständige Fachoberfläche
  lib/data-store.ts       Browser- und Serveradapter
  lib/time.ts             Arbeitszeit- und Sollzeitberechnung
  lib/pdf.ts              PDF-Monatsbericht
server/
  migrations/             PostgreSQL-Schema
  src/index.mjs           HTTP-API und statische Auslieferung
  src/auth.mjs            Passwort- und Sitzungslogik
  src/data.mjs            Laden und transaktionales Speichern
  src/validation.mjs      serverseitige Datenvalidierung
```

## Weiterführende Anleitungen

- [INSTALLATION.md](INSTALLATION.md) – Installation und erste Tests
- [DATABASE_SETUP.md](DATABASE_SETUP.md) – PostgreSQL- und Servereinrichtung, Docker, Backups und Produktion
