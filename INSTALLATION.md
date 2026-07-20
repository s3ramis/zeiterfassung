# Installation und lokaler Test

## 1. Was muss installiert sein?

Für den lokalen Test werden nur folgende Dinge benötigt:

1. **Node.js 24 LTS** inklusive npm
2. Ein moderner Browser, beispielsweise Chrome, Edge, Firefox oder Safari
3. Optional ein Editor wie Visual Studio Code
4. Optional Git, falls das Projekt später über ein Repository verwaltet werden soll

Nicht erforderlich sind:

- Docker
- PostgreSQL oder eine andere Datenbank
- Java
- Python
- ein separater Webserver
- globale Installationen von React, TypeScript oder Vite

React, TypeScript, Vite und jsPDF werden mit `npm install` automatisch nur für dieses Projekt installiert.

## 2. Node.js installieren

### Windows

1. Die LTS-Version von Node.js von der offiziellen Node.js-Seite herunterladen.
2. Den Installer starten.
3. Die Standardoptionen inklusive npm beibehalten.
4. PowerShell oder Eingabeaufforderung neu öffnen.
5. Installation prüfen:

```powershell
node --version
npm --version
```

Die Node-Version muss mindestens `22.12.0` sein. Empfohlen ist eine aktuelle Version aus der 24-LTS-Reihe.

Falls PowerShell meldet, dass `npm.ps1` nicht ausgeführt werden darf, kann alternativ Folgendes verwendet werden:

```powershell
npm.cmd install
npm.cmd run dev
```

Oder einmalig für den eigenen Benutzer:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### macOS

Variante A: offizieller Installer von der Node.js-Webseite.

Variante B mit Homebrew:

```bash
brew install node@24
```

Danach prüfen:

```bash
node --version
npm --version
```

### Linux

Am zuverlässigsten ist ein Versionsmanager wie `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Terminal neu öffnen und anschließend:

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

Alternativ kann Node.js über die Paketverwaltung der Distribution installiert werden. Dabei darauf achten, dass die Version mindestens 22.12 ist.

## 3. Projekt entpacken

Die ZIP-Datei in einen beliebigen Ordner entpacken, zum Beispiel:

### Windows

```text
C:\Projekte\timepilot-mvp
```

### macOS/Linux

```text
~/Projekte/timepilot-mvp
```

## 4. Terminal im Projektordner öffnen

### Windows PowerShell

```powershell
cd C:\Projekte\timepilot-mvp
```

### macOS/Linux

```bash
cd ~/Projekte/timepilot-mvp
```

## 5. Abhängigkeiten installieren

```bash
npm install
```

Dadurch werden lokal im Unterordner `node_modules` installiert:

- React 19
- React DOM
- TypeScript
- Vite 8
- jsPDF

Es ist keine globale Framework-Installation erforderlich.

## 6. Entwicklungsserver starten

```bash
npm run dev
```

Vite zeigt anschließend eine lokale Adresse an. Standardmäßig:

```text
http://localhost:5173
```

Diese Adresse im Browser öffnen.

Der Server läuft, solange das Terminal geöffnet bleibt. Beenden mit:

```text
Strg + C
```

## 7. Erste Funktionsprüfung

1. In den **Einstellungen** Name, Bundesland und Jahresurlaub festlegen.
2. Unter **Arbeitspläne** den vorhandenen 40-Stunden-Plan prüfen oder einen neuen Plan anlegen.
3. Auf der Übersicht **Einstempeln** drücken.
4. Nach kurzer Zeit **Pause Anfang** und **Pause Ende** testen.
5. **Ausstempeln** drücken.
6. Einen Kalendertag auswählen und eine Bemerkung speichern.
7. Für einen vergangenen Tag Start, Ende und Pause manuell eintragen.
8. Urlaub oder Krankheit von/bis Datum eintragen.
9. Den sichtbaren Monat als PDF exportieren.
10. Unter Einstellungen ein JSON-Backup exportieren.

## 8. Produktionsversion bauen und PWA testen

```bash
npm run build
npm run preview
```

Anschließend öffnen:

```text
http://localhost:4173
```

In Chrome oder Edge kann dann je nach Browser eine Installationsschaltfläche in der Adressleiste erscheinen. Alternativ im Browsermenü **App installieren** oder **Zum Startbildschirm hinzufügen** wählen.

## 9. TypeScript-Prüfung

```bash
npm run check
```

## 10. Häufige Probleme

### `node` oder `npm` wurde nicht gefunden

Terminal nach der Node.js-Installation vollständig schließen und neu öffnen. Danach erneut `node --version` ausführen.

### Node-Version ist zu alt

Eine aktuelle Node.js-LTS-Version installieren. Vite 8 benötigt eine moderne Node-Version.

### Port 5173 ist belegt

```bash
npm run dev -- --port 5174
```

Dann öffnen:

```text
http://localhost:5174
```

### Feiertage sind unvollständig

Die OpenHolidays API war möglicherweise nicht erreichbar. In den Einstellungen wird angezeigt, ob die API oder der bundesweite Offline-Fallback verwendet wird. Bei Fallback fehlen regionale Feiertage.

### Daten sind verschwunden

Die App speichert im Browserprofil. Prüfen, ob derselbe Browser und dasselbe Profil verwendet werden. Browserdaten oder Inkognito-Modus können die lokale Speicherung löschen. Ein vorhandenes JSON-Backup kann unter Einstellungen importiert werden.

### Die Seite zeigt nach einem Update eine alte Version

Bei einem Produktionsbuild kann der Service Worker alte Dateien zwischenspeichern. Im Browser die Website-Daten für `localhost` löschen oder den Service Worker in den Entwicklertools entfernen und die Seite neu laden.

## 11. Für einen produktiven Betrieb

Für einen echten Firmenbetrieb sollte das MVP nicht unverändert verwendet werden. Empfohlene Ergänzungen:

- Backend mit Node.js und PostgreSQL
- Benutzeranmeldung über Microsoft Entra ID, Google Workspace oder Keycloak
- serverseitige Zugriffsrechte
- unveränderliches Audit-Log
- zentrale Backups
- Verschlüsselung und Datenschutzkonzept
- serverseitiger PDF-Export
- Tests und CI/CD
- Prüfung der arbeitsrechtlichen Anforderungen
