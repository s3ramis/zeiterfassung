# Installation und erster Test

## 1. Benötigte Software

### Browsermodus

- Node.js ab Version 22.12, empfohlen Node.js 24 LTS
- npm, wird zusammen mit Node.js installiert
- aktueller Chrome, Edge, Firefox oder Safari

### Datenbankmodus

Zusätzlich entweder:

- Docker Desktop beziehungsweise Docker Engine mit Docker Compose, empfohlen
- oder PostgreSQL ab Version 15

Git ist für ein entpacktes ZIP nicht erforderlich.

## 2. Projekt vorbereiten

ZIP-Datei entpacken und ein Terminal beziehungsweise PowerShell im Projektordner öffnen:

```bash
npm install
```

React, TypeScript, Vite, jsPDF und der PostgreSQL-Treiber `pg` werden projektlokal installiert. Es ist keine globale Framework-Installation nötig.

## 3. Browsermodus starten

```bash
npm run dev
```

Im Browser öffnen:

```text
http://localhost:5173
```

Auf der Startseite **Browser-Daten** auswählen.

Die Daten werden ausschließlich im `localStorage` des aktuellen Browserprofils gespeichert.

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

## 4. Empfohlener Funktionstest

### Arbeitsplanregeln

1. Unter **Arbeitspläne** einen Plan bearbeiten.
2. Den Plan löschen.
3. Zur Übersicht wechseln: Das Tagessoll muss `0:00` anzeigen und **Einstempeln** muss gesperrt sein.
4. Einen neuen Plan für den heutigen Tag anlegen.
5. Prüfen, dass **Einstempeln** wieder möglich ist.

### Live-Zeiterfassung

1. Einstempeln.
2. Pause beginnen.
3. Pause beenden.
4. Ausstempeln.
5. Prüfen, dass Nettozeit und Pausenzeit korrekt angezeigt werden.

### Manuelle Zeiten und Pausen

1. Einen Kalendertag anklicken.
2. Arbeitsbeginn und Arbeitsende setzen.
3. Über **Pause hinzufügen** mindestens zwei Pausenintervalle erfassen.
4. Zeiten speichern.
5. Prüfen, dass alle Stempelereignisse mit Uhrzeit in den Tagesdetails erscheinen.

### Kalenderauswahl für Abwesenheiten

1. Einen Tag im Kalender anklicken: **Von** wird gesetzt.
2. Einen zweiten Tag anklicken: **Bis** wird gesetzt.
3. Urlaub eintragen.
4. Den Urlaub wieder löschen.

### Konfliktschutz

1. Für einen Tag manuelle Arbeitszeit erfassen.
2. Versuchen, für denselben Tag Urlaub einzutragen – der Eintrag muss abgelehnt werden.
3. Arbeitszeit entfernen und Urlaub eintragen.
4. Versuchen, für diesen Urlaubstag Arbeitszeit zu erfassen – die Eingabe muss gesperrt sein.

### Urlaub und Überstundenabbau

1. Urlaubsstand in Übersicht und Abwesenheitsseite prüfen.
2. Einen zukünftigen Überstundenabbau eintragen.
3. Prüfen, dass das Zeitkonto sofort um das Tagessoll reduziert wird.

### PDF-Export

1. Einen Monat mit Arbeitszeiten auswählen.
2. **PDF exportieren** anklicken.
3. Auf der Detailseite der PDF prüfen, dass Arbeitsbeginn, Arbeitsende und einzelne Pausenzeiten enthalten sind.

### Datensicherung

1. Unter **Einstellungen → Datensicherung** ein JSON-Backup exportieren.
2. Backup wieder importieren.

## 5. Datenbankmodus testen

Die vollständige Einrichtung steht in [DATABASE_SETUP.md](DATABASE_SETUP.md).

Mit PostgreSQL in Docker:

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

Danach:

1. **Datenbank-Server** auswählen.
2. API-Adresse `http://localhost:3001/api` verwenden.
3. **Konto anlegen** auswählen.
4. Anzeigename, E-Mail-Adresse und ein Passwort mit mindestens zehn Zeichen eingeben.
5. Nach der Registrierung denselben Funktionstest wie im Browsermodus durchführen.

Der Synchronisierungsstatus wird in der Kopfzeile und am unteren Fensterrand angezeigt.

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

Der Node-Server liefert dann API und gebautes Frontend aus.

## 7. Automatische Prüfungen

```bash
npm run check
```

Der Befehl führt die TypeScript-Prüfung und die Server-Unit-Tests aus. Geprüft werden unter anderem Authentifizierung, Datenvalidierung, löschbare Arbeitspläne und Urlaubskonflikte.

## 8. Häufige Probleme

### `node` oder `npm` wurde nicht gefunden

Node.js installieren und das Terminal vollständig neu öffnen.

### Port 5173 ist belegt

Den anderen Vite-Prozess beenden. Das Projekt verwendet einen festen Port, damit die lokale CORS-Konfiguration eindeutig bleibt.

### Port 3001 ist belegt

In `.env` beispielsweise setzen:

```env
PORT=3010
```

Dann `http://localhost:3010/api` als Serveradresse eintragen und den Ursprung gegebenenfalls zu `CORS_ORIGINS` hinzufügen.

### Server ist nicht erreichbar

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

### PDF wird nicht gespeichert

Downloadberechtigung des Browsers prüfen. Der PDF-Export erfolgt lokal im Browser.

### Browserdaten wurden gelöscht

Ein zuvor exportiertes JSON-Backup unter **Einstellungen → Datensicherung** importieren.
