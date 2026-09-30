# Windows: TimePilot ohne vorinstallierte Entwicklungssoftware

## Kurzfassung

1. Projekt als ZIP herunterladen und **vollständig entpacken**.
2. [install-local-windows.cmd](install-local-windows.cmd) mit Rechtsklick → **Als Administrator ausführen** starten.
3. Einrichtung abwarten. Anschließend die neue Desktop-Verknüpfung **TimePilot** öffnen.
4. **Datenbank-Server** auswählen, die vorbelegte API-Adresse beibehalten und ein Konto anlegen. **Auswahl auf diesem Gerät merken** aktivieren, wenn gewünscht.

Das Einrichtungsfenster darf danach geschlossen werden. **Keine Startskripte und keine Terminals offen lassen.** Server und Datenbank laufen als echte Windows-Dienste, auch ohne angemeldeten Benutzer. Nach einem Neustart starten sie automatisch. Die Desktop-Verknüpfung öffnet ausschließlich den Browser.

## Voraussetzungen und Grenzen

- Windows 11 x64 oder Windows 10 22H2 x64; aus Sicherheitsgründen nur ein noch mit Updates versorgtes Windows verwenden. ARM64, macOS und Linux werden von diesem Installer nicht unterstützt.
- Lokale Administratorrechte für Installation/Verwaltung und eine Internetverbindung während der Einrichtung.
- Aktueller Browser; Edge ist auf Windows bereits vorhanden.
- Mindestens etwa **4 GB freier Speicher**, zusätzlich Platz für Daten und Sicherungen.
- PowerShell 5.1, .NET Framework 4.6.1 oder neuer und curl gehören zu den genannten Windows-Versionen. Auf absichtlich reduzierten Windows-Abbildern können diese Systembestandteile fehlen.

**Nicht vorher installieren:** Node.js, npm, PostgreSQL, Docker, WSL, Git oder eine Entwicklungsumgebung. Das Skript lädt private Laufzeiten selbst herunter; eine gegebenenfalls fehlende Microsoft-C++-Laufzeit wird automatisch installiert. Eine von Windows verlangte Administratorbestätigung ist unvermeidbar. Falls die C++-Installation einen Neustart benötigt, wird dies gemeldet: neu starten und dasselbe Skript nochmals ausführen.

Die Dateien werden aus nodejs.org, GitHub und EnterpriseDB per HTTPS bezogen. Node.js 24.21.0, PostgreSQL 17.11 und WinSW 2.12.0 sind über feste SHA-256-Prüfsummen abgesichert. Beim Microsoft-C++-Installer wird die gültige Microsoft-Signatur geprüft. Netzwerk-/Firmenrichtlinien können Downloads oder npm blockieren. Lizenzen der mitgelieferten Komponenten bleiben gültig; insbesondere benötigt diese Variante **keine Docker-Desktop-Lizenz**.

## Was automatisch eingerichtet wird

| Bestandteil | Einrichtung |
| --- | --- |
| Installationsordner | standardmäßig `C:\ProgramData\TimePilot`, unabhängig vom ZIP-Ordner |
| Node.js/npm | private Laufzeit, keine Änderung der globalen PATH-Variable |
| PostgreSQL | privater Cluster, keine Verwendung/Änderung anderer PostgreSQL-Installationen |
| App | reproduzierbare Paketinstallation mit Lockfile, Tests und Produktionsbuild |
| Windows-Dienste | `TimePilotDatabase` und `TimePilotApp`, automatischer Start und Wiederanlauf nach Absturz |
| Dienstkonten | NetworkService für PostgreSQL, LocalService für Node; nicht LocalSystem |
| Zugangsdaten | zufällige getrennte Admin-/App-Passwörter; App-Rolle ist kein Datenbank-Superuser |
| Migrationen | automatisch beim Serverstart; transaktional und gegen parallelen Start gesperrt |
| Sicherungen | täglich 03:00 Uhr per Aufgabenplanung als SYSTEM, verpasster Termin wird nachgeholt |
| Browserzugang | Desktop-Verknüpfung für alle Benutzer, `http://localhost:3001` |

Der Installer fragt **nicht** nach Datenbankpasswörtern. Diese stehen geschützt im Installationsordner. Das persönliche TimePilot-Kennwort wird erst im Browser eingegeben. Die E-Mail-Adresse ist hier eine Konto-Kennung; es wird keine Bestätigungs-Mail verschickt.

## Netzwerkabschirmung

- App: **127.0.0.1:3001**, nur auf diesem Computer erreichbar.
- PostgreSQL: **127.0.0.1:54329**, nur auf diesem Computer erreichbar, mit SCRAM-Passwortauthentifizierung.
- Keine Bindung an `0.0.0.0`, keine Firewallfreigabe, kein Router-Portforwarding, keine öffentliche Datenbankadresse.
- Fremde Browser-Ursprünge werden von der API abgewiesen. Die Windows-Dienstvariante ignoriert geerbte externe Datenbank-Verbindungsvariablen.

Damit sind **auch andere Geräte im LAN ausgeschlossen**. Verschiedene Windows-Benutzer auf demselben Rechner können die App aufrufen und benötigen jeweils ein Konto. „Lokal“ bedeutet nicht Schutz vor einem lokalen Administrator oder Schadsoftware. HTTP ist für Loopback vorgesehen, nicht für eine spätere Internetfreigabe. Für Fernzugriff wäre eine eigene HTTPS-/Sicherheitskonzeption nötig.

Der Browser ruft bei Bedarf die OpenHolidays-API für Feiertage auf. Arbeitszeit-/Kontodaten bleiben dabei im lokalen Server; bei fehlender Internetverbindung werden Offline-Feiertage verwendet, allerdings nicht alle bundeslandspezifischen Feiertage. Die Datenbank wird dadurch nicht ins Internet veröffentlicht.

## Erstbenutzung und bisherige Browserdaten

Im Browser `http://localhost:3001` öffnen. **Datenbank-Server** auswählen; API-Adresse: `http://localhost:3001/api`. Danach **Konto anlegen**, Anzeigename, E-Mail-Kennung und mindestens zehn Zeichen Passwort eingeben.

Der Browsermodus bleibt verfügbar. Dort gespeicherte Daten werden **nicht automatisch** in die Datenbank kopiert:

1. In der bisherigen Browser-App unter Einstellungen → Datensicherung ein JSON-Backup exportieren.
2. Im Datenbankmodus anmelden und dieses Backup importieren.
3. Den Status **Mit Server synchronisiert** abwarten, neu laden und die Daten prüfen.

Serverbetrieb benötigt eine laufende lokale Datenbank. Bei Fehlern bleibt die Änderung zunächst im geöffneten Browser, ist aber nicht gesichert. Vor Schließen/Neuladen auf den Synchronisationsstatus achten; bei ungespeicherten Änderungen wird eine Browserwarnung angefordert. Bei Konflikten zwischen zwei Tabs nicht blind weiterarbeiten: lokale Daten zuerst als JSON exportieren, neu laden und Änderungen bewusst abgleichen.

## Verwaltung

Für normale Nutzung wird nur die Desktop-Verknüpfung benötigt. Für Administration PowerShell **als Administrator** öffnen. Die folgenden Beispiele verwenden den Standardordner.

### Status und Netzwerkadressen

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Status
```

Zeigt Dienste, letzten Sicherungslauf, Datenbank-Healthcheck und Listen-Adressen. Beide Listen-Adressen müssen **127.0.0.1** sein. Ein Healthcheck ist auch im Browser unter `http://localhost:3001/api/health` möglich; erwartet wird `ok: true`.

### Stoppen und starten

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Stop
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Start
```

Alternativ in der Windows-Diensteverwaltung `services.msc`: beim Stoppen zuerst TimePilot Server, dann TimePilot Datenbank. Bei Start umgekehrt. Ein manuelles Stoppen verhindert nicht den automatischen Start beim nächsten Windows-Neustart.

### Sicherung

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Backup
```

Automatische Sicherungen liegen im Unterordner **backups** und werden nach 30 Tagen entfernt. Sicherungen vor Update/Wiederherstellung werden nicht automatisch entfernt. Der Zielordner ist für normale Benutzer nicht zugänglich. Ein anderer Dateipfad ist möglich:

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Backup -BackupPath 'D:\Sicherungen\TimePilot.dump'
```

Der Zielordner muss existieren; eine bestehende Datei wird nicht überschrieben. Alle Konten, Passwort-Hashes, Daten und Sitzungen sind im Dump enthalten: **vertraulich behandeln**. Ein Backup auf derselben Festplatte schützt nicht vor deren Defekt. Regelmäßig verschlüsselt auf ein anderes Medium kopieren und Wiederherstellung testen. Für einen kompletten Rechnerumzug zusätzlich die geschützten Zugangsdaten und Konfiguration sichern; alternativ auf dem neuen Rechner frisch installieren und den Dump einspielen.

Die Aufgabenplanung zeigt unter **TimePilotBackup** den letzten Exitcode; `0` bedeutet Erfolg. Rechner im ausgeschalteten Zustand können keine Backups erstellen. Ein später nachgeholter Lauf ersetzt nicht die Prüfung, ob Sicherungen tatsächlich vorhanden sind.

### Wiederherstellung — ersetzt sämtliche Konten und Daten

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action Restore -BackupPath 'D:\Sicherungen\TimePilot.dump' -ConfirmRestore
```

Zuerst wird eine Sicherheitssicherung erstellt, dann der App-Dienst gestoppt. Die Wiederherstellung läuft transaktional. Anschließend werden alte Sitzungstoken gelöscht: alle Nutzer müssen sich neu anmelden. Bei einem Fehler bleibt die App absichtlich gestoppt; Fehlermeldung prüfen, bevor sie wieder gestartet wird. Auf dem neuen Rechner muss zuerst eine vollständige TimePilot-Installation vorhanden sein.

### Aktualisierung

Neues Projekt-ZIP entpacken und den Installer erneut mit denselben Ports und demselben Installationsordner ausführen. Bestehende Daten bleiben erhalten, eine laufende Datenbank wird vor dem Update gesichert. Die fest eingebauten Laufzeitversionen werden **nicht automatisch** aus dem Internet auf die neueste Version geändert. Updates müssen bewusst mit geprüften Downloads/Prüfsummen in einer neueren Projektversion erfolgen. PostgreSQL-Major-Upgrades werden ausdrücklich nicht automatisch durchgeführt.

Der App-Ordner wird beim Update neu aufgebaut; keine eigenen Dateien dort ablegen. Vor größeren Änderungen extern sichern. Der Installer hat keinen automatischen Programm-Rollback: bei einem Fehler bleiben Daten erhalten, aber ein erneuter erfolgreicher Installationslauf kann nötig sein.

### Dienste entfernen

```powershell
& 'C:\ProgramData\TimePilot\management\manage.ps1' -Action RemoveServices
```

Entfernt Dienste und Backup-Aufgabe. Daten, Zugangsdaten und Backups bleiben absichtlich erhalten. Erst nach geprüfter externer Sicherung den Installationsordner und die Desktop-Verknüpfung manuell löschen.

## Andere Ports oder Installationsordner

Für abweichende Werte statt Doppelklick eine administrative PowerShell im entpackten Projekt öffnen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -Port 3010 -DbPort 54330 -InstallDir 'C:\ProgramData\TimePilot'
```

Danach Browseradresse `http://localhost:3010` verwenden. Bei späteren Wiederholungen dieselben Werte angeben. Es wird keine dauerhafte Änderung der PowerShell-Ausführungsrichtlinie vorgenommen. Unternehmensrichtlinien können die Ausführung dennoch untersagen; diese nicht eigenmächtig umgehen.

## Fehlerbehebung

- **Administratorrechte fehlen:** Installer ausdrücklich per Rechtsklick als Administrator starten.
- **Port belegt:** anderen Port wählen. Bestehende fremde Dienste werden nicht beendet oder geändert.
- **Download/Prüfsumme fehlgeschlagen:** Verbindung/Proxy prüfen und erneut starten; falsche Downloads werden nicht ausgeführt.
- **Dienst startet nicht:** Unterordner **logs/app** und **logs/postgres** prüfen. Logdateien werden größenbegrenzt rotiert.
- **Unvollständiges initdb:** Ohne fertigen PostgreSQL-Cluster wird ein nicht leerer Datenordner vorsichtshalber nicht gelöscht. Diagnose prüfen; nur bei nachweislich fehlgeschlagener, datenloser Erstinstallation den Ordner **data** administrativ entfernen und erneut einrichten.
- **Zugangsdaten verloren:** Nicht einfach neue Passwörter in die Konfiguration schreiben. Geschützte Zugangsdaten aus Sicherung wiederherstellen oder eine frische Installation mit anschließendem Dump-Restore vornehmen.
- **Fenster im Betrieb:** Die älteren Entwicklungsstartskripte nicht verwenden. Sie sind kein Dienstbetrieb. Der neue Installer darf nur während der Einrichtung eine Konsole anzeigen.

## Prüfstand

Siehe [DATABASE_READINESS.md](DATABASE_READINESS.md) für behobene Befunde, Tests und verbleibende Grenzen. Native PostgreSQL-/HTTP-Tests sind von einem kompletten Windows-Dienst-/Neustarttest zu unterscheiden; letzterer benötigt einen separaten administrativen Testrechner.
