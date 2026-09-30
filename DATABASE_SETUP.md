# PostgreSQL- und TimePilot-Server einrichten

**Empfohlen für Windows-Einzelplatzbetrieb:** [WINDOWS_LOCAL_SETUP.md](WINDOWS_LOCAL_SETUP.md) beschreibt die automatisierte Einrichtung ohne vorinstalliertes Node.js, Docker oder PostgreSQL. Der [Installer](install-local-windows.cmd) richtet lokale Hintergrunddienste und tägliche Sicherungen ein. Siehe auch [DATABASE_READINESS.md](DATABASE_READINESS.md).

Diese Anleitung beschreibt drei Betriebsvarianten:

1. komplette App mit Docker
2. PostgreSQL in Docker und App lokal über Node.js
3. vorhandener oder nativ installierter PostgreSQL-Server

## Variante A: komplette App mit Docker

### Voraussetzungen

- Docker Desktop unter Windows/macOS oder Docker Engine unter Linux
- Docker Compose V2

### Einrichtung

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

In `.env` mindestens ändern:

```env
POSTGRES_PASSWORD=ein_langes_zufaelliges_passwort
```

Starten:

```bash
docker compose -f docker-compose.full.yml up --build -d
```

Im Browser öffnen:

```text
http://localhost:3001
```

**Datenbank-Server** auswählen. Die API-Adresse lautet:

```text
http://localhost:3001/api
```

Danach ein Konto mit Anzeigename, E-Mail-Adresse und Passwort anlegen.

### Dienste

- `postgres`: PostgreSQL 17
- `app`: React-Build, Node.js-API und statische Auslieferung
- automatische SQL-Migrationen beim Serverstart
- persistentes Docker-Volume `timepilot_postgres_data`
- PostgreSQL ohne veröffentlichten Host-Port; HTTP nur unter 127.0.0.1 erreichbar
- `-d` verhindert eine laufende Vordergrundkonsole; unter Windows muss Docker Desktop dennoch laufen und entsprechend für Autostart konfiguriert sein. Für Dienstbetrieb ohne Desktop-Abhängigkeit die native Windows-Variante verwenden.

### Stoppen

```bash
docker compose -f docker-compose.full.yml down
```

Daten bleiben erhalten.

Alles inklusive Datenbankvolume löschen:

```bash
docker compose -f docker-compose.full.yml down -v
```

## Variante B: PostgreSQL in Docker, App lokal

### 1. Datenbank starten

```bash
docker compose up -d
```

Lokale Testwerte:

```text
Datenbank: timepilot
Benutzer:  timepilot
Passwort:  timepilot_dev_password
Port:      5432
```

### 2. Konfiguration anlegen

```bash
cp .env.example .env
```

Die vorhandene Verbindung passt zu `docker-compose.yml`:

```env
DATABASE_URL=postgresql://timepilot:timepilot_dev_password@localhost:5432/timepilot
```

### 3. Pakete installieren und starten

```bash
npm install
npm run dev:full
```

Alternativ getrennt:

```bash
npm run dev:server
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

### 4. Migrationen manuell ausführen

```bash
npm run db:migrate
```

Der Server führt ausstehende Migrationen beim Start ebenfalls automatisch aus.

## Variante C: vorhandener PostgreSQL-Server

### 1. Benutzer und Datenbank anlegen

```sql
CREATE USER timepilot WITH PASSWORD 'ein_langes_zufaelliges_passwort';
CREATE DATABASE timepilot OWNER timepilot;
```

### 2. Verbindungsadresse setzen

```env
DATABASE_URL=postgresql://timepilot:ein_langes_zufaelliges_passwort@db.example.internal:5432/timepilot
```

Bei erforderlichem TLS:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

### 3. Schema und App starten

```bash
npm install
npm run db:migrate
npm run build
npm start
```

## Umgebungsvariablen

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `DATABASE_URL` | vollständige PostgreSQL-Verbindungsadresse | erforderlich, sofern keine `PG*`-Variablen verwendet werden |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | alternative Einzelwerte | optional |
| `PORT` | HTTP-Port des TimePilot-Servers | `3001` |
| `HOST` | Bind-Adresse | `127.0.0.1`; nur im Container intern `0.0.0.0` |
| `CORS_ORIGINS` | erlaubte Browser-Ursprünge, kommasepariert | `http://localhost:5173` |
| `SESSION_DAYS` | Gültigkeit einer Sitzung | `30` |
| `DB_POOL_SIZE` | maximale PostgreSQL-Verbindungen | `10` |
| `DB_SSL` | TLS für PostgreSQL | `false` |
| `DB_SSL_REJECT_UNAUTHORIZED` | Datenbankzertifikat prüfen | `true` |

## Datenbankschema

Migrationen liegen in `server/migrations/` und werden in `schema_migrations` protokolliert.

Wichtige Tabellen:

- `users`: Konto, Einstellungen und Revisionsnummer
- `sessions`: gehashte Sitzungstoken mit Ablaufdatum
- `time_events`: einzelne Stempel-, Pausen- und Ausstempelereignisse
- `absences`: Urlaub, Krankheit und Überstundenabbau
- `work_plans`: Gültigkeitszeiträume
- `work_plan_days`: Sollminuten pro Wochentag
- `daily_notes`: Bemerkungen pro Datum
- `holiday_cache`: Feiertage pro Benutzer, Bundesland und Jahr

Arbeitspläne sind optional. Ein Benutzer darf alle Arbeitspläne löschen. Zeiträume ohne gültigen Plan erhalten in der Fachlogik ein Tagessoll von `0:00` Stunden.

Manuelle Pausenzeiten benötigen keine zusätzliche Tabelle: Jede Pause wird als `BREAK_START` und `BREAK_END` in `time_events` gespeichert. Dadurch stehen die exakten Uhrzeiten auch im Datenbankmodus und im PDF-Export zur Verfügung.

## Serverseitige Geschäftsregeln

Der Server validiert unter anderem:

- erlaubte Zeit- und Abwesenheitstypen
- gültige Datums- und Zeitwerte
- nicht überlappende Arbeitspläne
- leere Arbeitsplanliste ist erlaubt
- Urlaub darf nicht mit vorhandenen Arbeitszeiten überlappen
- getrennte Benutzerdaten und gültige Revisionsnummern

Die Überstundenberechnung und der PDF-Export verwenden dieselbe gemeinsame Fachlogik wie der Browsermodus.

## Backup und Wiederherstellung

### Fachliches JSON-Backup

Für einzelne Konten:

```text
Einstellungen → Datensicherung → JSON-Backup exportieren
```

Das Backup kann auch in den Browsermodus importiert werden.

### PostgreSQL-Backup im Docker-Komplettbetrieb

```bash
docker compose -f docker-compose.full.yml exec -T postgres \
  pg_dump -U timepilot -d timepilot > timepilot-backup.sql
```

Wiederherstellung in eine leere Datenbank:

```bash
docker compose -f docker-compose.full.yml exec -T postgres \
  psql -U timepilot -d timepilot < timepilot-backup.sql
```

Unter PowerShell die Zeilenfortsetzung `\` entfernen oder durch einen PowerShell-Backtick ersetzen.

### Regelmäßige Backups

Für den produktiven Betrieb mindestens täglich sichern und Wiederherstellungen regelmäßig testen.

## Datenbank zurücksetzen

```bash
npm run db:reset
```

Zur Bestätigung muss exakt `RESET` eingegeben werden. Danach werden alle Konten und Fachdaten gelöscht und das Schema neu angelegt.

## Betrieb hinter HTTPS

Für Zugriff außerhalb des lokalen Rechners sollte TimePilot hinter Caddy, nginx oder Traefik betrieben werden.

Mindestens erforderlich:

- HTTPS erzwingen
- PostgreSQL nicht öffentlich freigeben
- starkes Datenbankpasswort
- `CORS_ORIGINS` auf die echte Webadresse begrenzen
- regelmäßige Backups
- Server- und Containerupdates
- zentraler Rate-Limiter am Reverse Proxy
- für öffentlichen Betrieb zusätzlich E-Mail-Verifikation und Passwort-Wiederherstellung

## Serverzustand prüfen

```bash
curl http://localhost:3001/api/health
```

Antwort:

```json
{"ok":true,"service":"timepilot-server"}
```

Logs:

```bash
docker compose -f docker-compose.full.yml logs -f app postgres
```
