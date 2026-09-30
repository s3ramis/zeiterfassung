# Prüfung des lokalen Datenbankbetriebs

Stand: 30.09.2026. Ziel: lokale Windows-Einzelplatzinstallation, keine Internetfreigabe.

## Behobene Befunde

- **Startblocker:** fehlender `node:path`-Import im Migrationsrunner; erste Datenbankinitialisierung konnte bisher abbrechen.
- **Parallele Migrationen:** transaktionaler PostgreSQL-Advisory-Lock verhindert doppelte Anwendung bei gleichzeitig startenden Servern.
- **Inkonsistente Lesezugriffe:** Fachdaten und Revision wurden über mehrere Poolverbindungen ohne gemeinsamen Snapshot geladen. Jetzt eine Verbindung mit `REPEATABLE READ READ ONLY`; das verhindert Mischstände während gleichzeitiger Änderungen.
- **Backup-Import in andere Konten:** Ereignis-, Abwesenheits- und Arbeitsplan-IDs waren datenbankweit eindeutig und kollidierten bei Wiederverwendung eines JSON-Backups. Eine automatische zweite Migration macht diese IDs benutzergebunden, einschließlich zusammengesetzter Arbeitsplan-Fremdschlüssel; bestehende Daten bleiben erhalten.
- **Reset/Autosave-Rennen:** verzögerte alte Speichervorgänge konnten einen Reset überholen. Timer wird vor Reset/Moduswechsel/Logout abgebrochen, Änderungen während der Operation werden nicht neu eingereiht.
- **Schnelle Rückänderungen:** eine Änderung zurück auf den zuletzt gespeicherten Stand darf einen noch laufenden anderen Speichervorgang nicht überspringen. Warteschlange berücksichtigt jetzt ausstehende Saves; der Status meldet nicht vorzeitig vollständige Synchronisation.
- **Schließen bei ungespeicherten Änderungen:** Browserwarnung ergänzt; diese ist keine dauerhafte Offline-Warteschlange.
- **Netzwerk:** Node bindet standardmäßig an Loopback, Entwicklungs-PostgreSQL veröffentlicht nur Loopback. Im Docker-Komplettbetrieb ist PostgreSQL weiterhin gar nicht zum Host veröffentlicht; der HTTP-Port ist jetzt ebenfalls Loopback.
- **Browserzugriffe:** nicht freigegebene `Origin`-Header werden vor API-Nebenwirkungen abgewiesen, statt nur CORS-Antwortheader wegzulassen.
- **Eingabefehler:** ungültige Datensätze/JSON-Strukturen liefern HTTP 400 statt HTTP 500; auch unerwartete Formen werden abgefangen.
- **Abhängigkeiten:** jsPDF aktualisiert und gemeldete transitive npm-Sicherheitsbefunde bereinigt; Lockfile beibehalten.
- **Betrieb:** neue native Windows-Dienste mit Zufallspasswörtern, eingeschränkter App-Rolle, privaten ACLs, automatischem Start, Logrotation und täglichen Backups. Vorhandene Entwicklungsstarter bleiben nur für Entwicklung.

## Bereits vorhandene sinnvolle Absicherungen

- scrypt-Passwort-Hashes mit individuellem Salt und zufällige Sitzungstoken; serverseitig nur Token-Hashes.
- Benutzergebundene SQL-Abfragen, parametrisierte Queries, Foreign Keys und Schema-Constraints.
- Schreibvorgänge innerhalb einer Transaktion und Revisionsprüfung unter Zeilensperre: konkurrierende Änderungen werden mit HTTP 409 zurückgewiesen.
- Serverseitige Validierung von Datumswerten, Datentypen, Arbeitsplanüberschneidungen und Urlaub/Arbeitszeit-Konflikten.
- Healthcheck prüft eine echte Datenbankabfrage, nicht nur einen laufenden HTTP-Prozess.
- Browser-/Datenbankmodus verwenden dieselbe fachliche Berechnung und Exportlogik.

## Automatisierte Prüfung

- `npm run check`: TypeScript und Server-Unit-/Regressionstests.
- `npm run build`: Produktionsbuild einschließlich TypeScript-Prüfung.
- `npm audit`: Abhängigkeitsprüfung gegen die jeweils aktuelle npm-Datenbank.
- `npm run test:integration`: echte, isolierte temporäre PostgreSQL-Datenbank; vorhandene `.env`-Datenbank wird nicht benutzt oder verändert. Benötigt PostgreSQL-Binaries über die Umgebungsvariable `TIMEPILOT_TEST_PG_BIN`.
- Die zweite Migration wird zusätzlich mit bestehenden Arbeitsplan-/Wochentagsdaten geprüft, einschließlich erhaltener Sollstunden und weiterhin funktionierender Löschkaskade.

Integrationstest deckt ab: eingeschränkte Nicht-Superuser-App-Rolle, leere Datenbank und parallele Migrationen, Healthcheck, Registrierung, doppelte Registrierung, richtige/falsche Anmeldung, Zugriffsverweigerung ohne Token, fremde Browser-Ursprünge, Daten speichern/laden, leere Arbeitspläne, zwei konkurrierende Schreibzugriffe, konsistenter Snapshot bei gleichzeitiger Änderung, Persistenz nach App-Neustart, pg_dump/pg_restore in eine zweite Datenbank, Trennung zweier Konten, ungültige Daten, Reset und Tokenentzug beim Logout.

Windows-Beispiel zur Wiederholung (PostgreSQL-Installationspfad gegebenenfalls anpassen):

```powershell
$env:TIMEPILOT_TEST_PG_BIN = 'C:\ProgramData\TimePilot\postgres\bin'
npm run test:integration
```

## Grenzen / keine pauschale Produktionszertifizierung

### Ergebnis der ausgeführten Prüfungen

Am 30.09.2026 erfolgreich: **14 Server-Tests**, TypeScript-Prüfung, Produktionsbuild, echter PostgreSQL-17.11-Integrationstest einschließlich Backup/Restore und **0 gemeldete npm-Sicherheitslücken**. Windows-Skripte wurden syntaktisch geprüft und die ACL-Konstruktion ohne Dienstinstallation getestet. Die fest eingebundene Node.js-24.21.0-Datei wurde heruntergeladen, ihre Prüfsumme verifiziert und die Laufzeit gestartet.

Zusätzlicher Browser-Smoketest: nach jsPDF-Update wurde ein gültiger PDF-Blob erzeugt. Mit absichtlich verzögerter **Mock-API** wurden eine schnelle Änderung/Rückänderung während laufender Speicherung sowie ein Reset vor Ablauf des Autosave-Timers geprüft: die letzte Änderung kam an, und nach Reset wurde kein alter Snapshot erneut gespeichert. Diese Mock-Tests ersetzen nicht die getrennt ausgeführten echten PostgreSQL-Tests.

Verbleibende Buildwarnung: großer JavaScript-Chunk; kein fehlgeschlagener Build. Die optionale Docker-Alpine-Basis wird vom vorhandenen Scanner weiterhin mit sieben hohen Befunden markiert, ist jedoch kein Bestandteil des nativen Windows-Installers.

### Noch offene Abnahme / Betriebsgrenzen

- **Vollständiger Installer-Test:** Installation auf einem frisch aufgesetzten Windows inklusive C++-Installation, Dienstregistrierung, ACLs, Reboot und Aufgabenplanung muss auf einem separaten administrativen Testrechner erfolgen. Tests ohne Dienstregistrierung belegen dies nicht.
- **Netzausfall:** keine dauerhafte Offline-Schreibwarteschlange im Servermodus. Synchronisationsstatus beachten und vor Verlust der Browsersitzung gegebenenfalls JSON exportieren.
- **Mehrere Tabs:** absichtlicher Konfliktschutz statt automatischer Zusammenführung. Bei 409 lokal sichern, neu laden und abgleichen.
- **Skalierung:** pro Speichern wird der gesamte Datenbestand eines Kontos ersetzt. Für lokale, kleine Installationen vertretbar; kein Nachweis für hohe Last oder sehr große Historien. HTTP-Anfragen sind größenbegrenzt.
- **Zeitzonen:** serverseitige Urlaub/Arbeitszeitprüfung verwendet Europe/Berlin, der Browser seine lokale Zeitzone. Windows auf die deutsche Zeitzone einstellen; internationale/abweichende Zeitzonen sind nicht separat zertifiziert.
- **Internetbetrieb:** keine E-Mail-Verifikation, Passwort-Wiederherstellung oder verteilte Rate-Limits. HTTPS und zusätzliche Absicherungen fehlen bewusst für dieses lokale Szenario. Nicht einfach Ports freigeben.
- **Backups:** lokale Dumps sind kein Schutz gegen Festplattenausfall. Externe verschlüsselte Kopien und echte Restore-Tests bleiben erforderlich.
- **Updates:** Abhängigkeiten, Node/PostgreSQL/WinSW und Windows müssen regelmäßig überprüft werden. Feste Downloadversionen sind reproduzierbar, aber nicht automatisch aktuell.
- **Docker:** ein vorhandener Container-Sicherheitsbefund des bisherigen Alpine-Basisimages ist separat zu bewerten; die empfohlene native Windows-Installation benutzt dieses Image nicht.
