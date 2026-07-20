# PostgreSQL- und TimePilot-Server einrichten

Diese Anleitung beschreibt drei Varianten:

1. komplette App mit Docker, am einfachsten
2. nur PostgreSQL mit Docker und App lokal über Node.js
3. vorhandener oder nativ installierter PostgreSQL-Server

## Variante A: komplette App mit Docker

### Voraussetzungen

- Docker Desktop unter Windows/macOS oder Docker Engine unter Linux
- Docker Compose V2

### Einrichtung

Projektordner öffnen und Konfiguration anlegen:

```bash
cp .env.example .env
```

Unter Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

In `.env` mindestens diesen Wert ändern:

```env
POSTGRES_PASSWORD=ein_langes_zufaelliges_passwort
```

Danach starten:

```bash
docker compose -f docker-compose.full.yml up --build
```

Im Browser öffnen:

```text
http://localhost:3001
```

Auf der TimePilot-Startseite **Datenbank-Server** wählen. Die vorausgefüllte API-Adresse sollte lauten:

```text
http://localhost:3001/api
```

Danach ein Konto über Anzeigename, E-Mail-Adresse und Passwort anlegen.

### Im Hintergrund

- `postgres` startet PostgreSQL 17.
- `app` baut React und startet den Node-Server.
- Der Node-Server führt SQL-Migrationen automatisch aus.
- PostgreSQL-Daten bleiben im Docker-Volume `timepilot_postgres_data` erhalten.

### Stoppen

```bash
docker compose -f docker-compose.full.yml down
```

Die Daten bleiben erhalten.

Alles einschließlich Datenbankvolume löschen:

```bash
docker compose -f docker-compose.full.yml down -v
```

Dieser Befehl löscht alle Konten und Arbeitszeiten unwiderruflich.

## Variante B: PostgreSQL in Docker, App lokal

Diese Variante ist für Entwicklung und Quellcodeänderungen praktisch.

### 1. Datenbank starten

```bash
docker compose up -d
```

Die Datei `docker-compose.yml` startet nur PostgreSQL auf Port 5432 mit:

```text
Datenbank: timepilot
Benutzer:  timepilot
Passwort:  timepilot_dev_password
```

Diese Werte sind nur für den lokalen Test gedacht.

### 2. App-Konfiguration erstellen

```bash
cp .env.example .env
```

Die enthaltene `DATABASE_URL` passt bereits zu `docker-compose.yml`:

```env
DATABASE_URL=postgresql://timepilot:timepilot_dev_password@localhost:5432/timepilot
```

### 3. Pakete installieren und starten

```bash
npm install
npm run dev:full
```

Alternativ getrennt in zwei Terminals:

```bash
npm run dev:server
```

und:

```bash
npm run dev:web
```

Frontend:

```text
http://localhost:5173
```

API:

```text
http://localhost:3001/api
```

### 4. Migrationen manuell prüfen

Der Server migriert automatisch. Ein manueller Lauf ist trotzdem möglich:

```bash
npm run db:migrate
```

## Variante C: vorhandener PostgreSQL-Server

### 1. Benutzer und Datenbank anlegen

Als PostgreSQL-Administrator:

```sql
CREATE USER timepilot WITH PASSWORD 'ein_langes_zufaelliges_passwort';
CREATE DATABASE timepilot OWNER timepilot;
```

### 2. Verbindungsadresse setzen

In `.env`:

```env
DATABASE_URL=postgresql://timepilot:ein_langes_zufaelliges_passwort@db.example.internal:5432/timepilot
```

Bei einem Dienst, der TLS verlangt:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

### 3. Schema einrichten und Server starten

```bash
npm install
npm run db:migrate
npm run build
npm start
```

## Umgebungsvariablen

| Variable | Bedeutung | Standard |
|---|---|---|
| `DATABASE_URL` | vollständige PostgreSQL-Verbindungsadresse | erforderlich, sofern keine `PG*`-Variablen verwendet werden |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | alternative getrennte PostgreSQL-Verbindungswerte | optional |
| `PORT` | HTTP-Port des TimePilot-Servers | `3001` |
| `HOST` | Bind-Adresse | `0.0.0.0` |
| `CORS_ORIGINS` | erlaubte Browser-Ursprünge, kommasepariert | `http://localhost:5173` |
| `SESSION_DAYS` | Gültigkeit einer Anmeldung | `30` |
| `DB_POOL_SIZE` | maximale PostgreSQL-Verbindungen | `10` |
| `DB_SSL` | TLS für PostgreSQL aktivieren | `false` |
| `DB_SSL_REJECT_UNAUTHORIZED` | Datenbankzertifikat prüfen | `true` |

## Datenbankschema

Migrationen liegen unter `server/migrations/` und werden in `schema_migrations` protokolliert.

Wichtige Tabellen:

- `users`: Konto, Einstellungen und Revisionsnummer
- `sessions`: gehashte Sitzungstoken mit Ablaufdatum
- `time_events`: einzelne Stempelereignisse
- `absences`: Urlaub, Krankheit und Überstundenausgleich
- `work_plans`: Gültigkeitszeiträume der Arbeitspläne
- `work_plan_days`: Sollminuten pro Wochentag
- `daily_notes`: Bemerkungen pro Datum
- `holiday_cache`: geladene Feiertage pro Benutzer und Bundesland/Jahr

Arbeitszeiten werden in PostgreSQL als Zeitstempel gespeichert. Tagessollzeiten werden als ganze Minuten gespeichert, um Rundungsfehler zu vermeiden.

## Backup und Wiederherstellung

### Fachliches JSON-Backup

Für einzelne Benutzer ist der Export in der App am einfachsten:

```text
Einstellungen → Datensicherung → JSON-Backup exportieren
```

Dieses Backup kann auch in den Browser-Modus importiert werden.

### Vollständiges PostgreSQL-Backup bei Docker-Komplettbetrieb

```bash
docker compose -f docker-compose.full.yml exec -T postgres \
  pg_dump -U timepilot -d timepilot > timepilot-backup.sql
```

Wiederherstellung in eine leere Datenbank:

```bash
docker compose -f docker-compose.full.yml exec -T postgres \
  psql -U timepilot -d timepilot < timepilot-backup.sql
```

Unter PowerShell funktionieren Ein- und Ausgabeumleitungen ebenfalls; die Zeilenfortsetzung `\` muss dort entfernt oder durch den PowerShell-Backtick ersetzt werden.

### Regelmäßige Backups

Für einen echten Betrieb mindestens täglich sichern und Wiederherstellung regelmäßig testen. Ein Backup ist erst dann belastbar, wenn ein Restore erfolgreich geprüft wurde.

## Datenbank zurücksetzen

Lokale Node-Variante:

```bash
npm run db:reset
```

Zur Bestätigung muss exakt `RESET` eingegeben werden. Danach werden das Schema neu erstellt und alle Konten gelöscht.

## Betrieb hinter HTTPS

Für Zugriff außerhalb des eigenen Rechners sollte TimePilot hinter einem Reverse Proxy wie Caddy, nginx oder Traefik betrieben werden.

Erforderlich:

- HTTPS erzwingen
- PostgreSQL nicht öffentlich ins Internet freigeben
- starkes Datenbankpasswort
- `CORS_ORIGINS` auf die echte Webadresse beschränken
- regelmäßige Datenbankbackups
- Server- und Containerupdates
- zentraler Rate-Limiter am Reverse Proxy; ein einfaches In-Memory-Limit ist bereits enthalten
- optional E-Mail-Verifikation und Passwort-zurücksetzen-Funktion

Die enthaltene Authentifizierung ist für lokalen, internen und MVP-Betrieb funktionsfähig. Für einen frei erreichbaren öffentlichen Dienst sind die genannten Härtungsmaßnahmen erforderlich.

## Serverzustand prüfen

```bash
curl http://localhost:3001/api/health
```

Antwort:

```json
{"ok":true,"service":"timepilot-server"}
```

Docker-Logs:

```bash
docker compose -f docker-compose.full.yml logs -f app postgres
```
