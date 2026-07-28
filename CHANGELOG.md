# Änderungen in Version 0.3.0

## Fachlogik

- Arbeitspläne sind nun ausnahmslos löschbar, auch der letzte Plan.
- Arbeitspläne können vollständig bearbeitet werden.
- Ohne gültigen Arbeitsplan beträgt das Tagessoll 0:00 Stunden.
- Die Live-Zeiterfassung kann ohne gültigen Arbeitsplan nicht gestartet werden.
- Manuelle Arbeitszeiten unterstützen beliebig viele Pausen mit Von-/Bis-Uhrzeit.
- Exakte Pausenzeiten erscheinen im PDF-Monatsbericht.
- Erster Kalenderklick füllt das Abwesenheitsfeld „Von“, der zweite Klick „Bis“.
- Urlaub kann nicht für Tage mit vorhandenen Arbeitszeiten eingetragen werden.
- An Urlaubstagen sind Live- und manuelle Arbeitszeiteinträge gesperrt.
- Der Urlaubsstand wird in Übersicht und Abwesenheitsverwaltung prominent angezeigt.
- „Überstundenausgleich“ wurde in der Oberfläche zu „Überstundenabbau“ vereinheitlicht.
- Überstundenabbau erhält keine Abwesenheitsgutschrift mehr und reduziert das Zeitkonto korrekt.
- Zukünftig gebuchter Überstundenabbau wird sofort vom verfügbaren Zeitkonto abgezogen.
- Der Server akzeptiert Benutzer ohne Arbeitsplan und validiert Urlaubskonflikte.

## Benutzeroberfläche

- vollständiges professionelles Dashboard-Redesign
- neue responsive Navigation für Desktop, Tablet und Smartphone
- modernisierte Zeiterfassungsaktionen, Statusanzeigen und Kennzahlen
- überarbeiteter Kalender mit klareren Zuständen und Bereichsauswahlhinweis
- neuer manueller Pauseneditor
- übersichtlichere Arbeitsplan- und Abwesenheitsverwaltung
- modernisierte Start-, Login- und Einstellungsseiten

## Technisches Fundament aus Version 0.2.0

- Browser- und PostgreSQL-Modus mit gemeinsamer DataStore-Schnittstelle
- E-Mail/Passwort-Registrierung ohne Drittanbieter
- scrypt-Passwort-Hashes und serverseitige Sitzungen
- normalisiertes PostgreSQL-Schema und automatische Migrationen
- transaktionale Datensynchronisierung mit Revisionskonfliktschutz
- Docker-Setups für Datenbank oder vollständige App
