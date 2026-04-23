# Zeiterfassung — Brandnertal Tourismus GmbH

Vollständiges Zeiterfassungssystem mit Admin-Dashboard, Handy-Stempel, Urlaubs-/Krankenstandsverwaltung und Monatsexport für die Buchhaltung.

## Standard-Logins

| Benutzer | Benutzername | Passwort | Rolle |
|---|---|---|---|
| Admin | `admin` | `admin123` | Admin |
| Päsi Mäkinen | `paesi` | `mitarbeiter123` | Mitarbeiter |
| Linda Müller | `linda` | `mitarbeiter123` | Mitarbeiter |
| Thessa Berger | `thessa` | `mitarbeiter123` | Mitarbeiter |

**Wichtig: Passwörter nach dem ersten Login im Admin-Bereich ändern!**

---

## Lokal testen (auf eigenem Computer)

1. [Node.js](https://nodejs.org) installieren (LTS-Version)
2. Diesen Ordner irgendwo speichern
3. Terminal/Eingabeaufforderung öffnen, in den Ordner wechseln:
   ```
   cd zeiterfassung
   npm install
   npm start
   ```
4. Browser öffnen: http://localhost:3000

---

## Online stellen mit Render.com (kostenlos)

### Schritt 1 — GitHub-Konto anlegen
- https://github.com aufrufen, kostenloses Konto erstellen

### Schritt 2 — Code hochladen
- Auf GitHub: "New repository" → Name: `zeiterfassung` → Create
- Alle Dateien aus diesem Ordner hochladen (drag & drop im Browser)

### Schritt 3 — Render.com
- https://render.com aufrufen, mit GitHub-Konto anmelden
- "New +" → "Web Service"
- GitHub-Repository `zeiterfassung` auswählen
- Einstellungen:
  - **Build Command:** `npm install`
  - **Start Command:** `npm start`
- "Create Web Service" klicken
- Nach 2-3 Minuten bekommt ihr eine URL wie: `https://zeiterfassung-brandnertal.onrender.com`

### Schritt 4 — Fertig!
- Diese URL an alle Mitarbeiter schicken
- Am Handy einfach im Browser öffnen — funktioniert wie eine App
- Tipp: "Zum Homescreen hinzufügen" → dann hat jeder ein App-Icon

---

## Features

**Mitarbeiter (Handy-optimiert):**
- Ein- und Ausstempeln mit einem Klick
- Echtzeituhr
- Zeit nachträglich eintragen
- Urlaub / Krankenstand melden
- Eigene letzte Buchungen sehen

**Admin-Dashboard:**
- Live-Übersicht: wer ist gerade eingestempelt?
- Alle Buchungen einsehen und löschen
- Abwesenheiten verwalten
- Monatsexport für Buchhaltung (druckbar, mit Unterschriftsfeldern)
- Mitarbeiter anlegen, Passwörter zurücksetzen
- Firmeneinstellungen (Pausenzeit, Kernarbeitszeit etc.)

---

## Datensicherung

Die Daten liegen in der Datei `data.db`. Diese Datei regelmäßig sichern!
Bei Render.com: Die Daten bleiben gespeichert solange der Service läuft.
Für dauerhaftere Sicherung: Datei monatlich herunterladen.
