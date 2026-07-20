# Installation und erster Test

## 1. Benötigte Software

### Für den Browser-Modus

- Node.js ab Version 22.12, empfohlen Node.js 24 LTS
- npm, wird zusammen mit Node.js installiert
- Chrome, Edge, Firefox oder Safari in einer aktuellen Version

### Zusätzlich für den Server-Modus

Eine der folgenden Varianten:

- Docker Desktop beziehungsweise Docker Engine mit Docker Compose, empfohlen
- oder eine lokale PostgreSQL-Installation ab Version 15

Git ist hilfreich, aber für ein entpacktes ZIP nicht erforderlich.

## 2. Projekt entpacken und Abhängigkeiten installieren

Terminal beziehungsweise PowerShell im Projektordner öffnen:

```bash
npm install
```

Dabei werden React, TypeScript, Vite, jsPDF und der PostgreSQL-Treiber `pg` lokal im Projekt installiert. Es ist keine globale Framework-Installation nötig.

## 3. Browser-Modus testen

```bash
npm run dev
```

Browser öffnen:

```text
http://localhost:5173
```

Auf der Startseite **Browser-Daten** auswählen.

Die Daten liegen dann im `localStorage` dieses Browserprofils. Ein anderer Browser, ein privates Fenster oder ein anderes Gerät sieht diese Daten nicht.

### Komfortskripte

Windows:

```text
start-windows.cmd
```

macOS/Linux:

```bash
chmod +x start.sh
./start.sh
```

## 4. Grundfunktionen prüfen

1. Einstempeln.
2. Pause starten und beenden.
3. Ausstempeln.
4. Im Kalender einen Tag auswählen und eine Bemerkung speichern.
5. Unter **Arbeitspläne** einen Plan mit Gültigkeitszeitraum anlegen.
6. Unter **Abwesenheiten** Urlaub oder Krankheit eintragen.
7. In der Übersicht einen Monat auswählen und **PDF exportieren** anklicken.
8. Unter **Einstellungen → Datensicherung** ein JSON-Backup exportieren.

## 5. Server-Modus testen

Die vollständige Einrichtung ist in [DATABASE_SETUP.md](DATABASE_SETUP.md) beschrieben.

Mit Docker als Datenbank:

```bash
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

docker compose up -d
npm run dev:full
```

Browser öffnen:

```text
http://localhost:5173
```

Dann:

1. **Datenbank-Server** auswählen.
2. API-Adresse `http://localhost:3001/api` verwenden.
3. **Konto anlegen** öffnen.
4. Anzeigename, E-Mail-Adresse und ein Passwort mit mindestens zehn Zeichen eingeben.
5. Nach der Registrierung wird das Konto direkt angemeldet.

Der Synchronisierungsstatus wird unten in der App angezeigt.

## 6. Produktionsbuild lokal testen

PostgreSQL und `.env` müssen eingerichtet sein.

```bash
npm run build
npm start
```

Anschließend:

```text
http://localhost:3001
```

Der Node-Server liefert dann sowohl die API als auch das gebaute Frontend aus.

## 7. Häufige Probleme

### `node` oder `npm` wurde nicht gefunden

Node.js installieren und das Terminal danach vollständig neu öffnen.

### Port 5173 ist belegt

Den anderen Vite-Prozess beenden. Das Projekt verwendet bewusst einen festen Port, damit die CORS-Konfiguration eindeutig bleibt.

### Port 3001 ist belegt

In `.env` einen anderen Wert setzen, zum Beispiel:

```env
PORT=3010
```

Dann in der Startauswahl `http://localhost:3010/api` eintragen und den neuen Ursprung gegebenenfalls zu `CORS_ORIGINS` hinzufügen.

### Anmeldung meldet einen Verbindungsfehler

Prüfen:

```bash
curl http://localhost:3001/api/health
```

Erwartete Antwort:

```json
{"ok":true,"service":"timepilot-server"}
```

### PostgreSQL ist noch nicht bereit

```bash
docker compose ps
docker compose logs postgres
```

### PDF wird nicht heruntergeladen

Browser-Downloadberechtigung prüfen. Der Export läuft lokal im Browser und wird nicht vom Server erzeugt.

### Browserdaten wurden versehentlich gelöscht

Ein zuvor exportiertes JSON-Backup unter **Einstellungen → Datensicherung** importieren.
