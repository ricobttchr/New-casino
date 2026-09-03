# NOVA Casino — Online-Modus (Account-Login, geräteübergreifend)

## Status ehrlich zusammengefasst

Der Client (`nova-casino.html`) hatte den Online-Modus bereits fast vollständig
vorbereitet: `js/backend.js` (Login/Signup/Logout, Spin-/Gamble-Requests,
Freundes-RPCs) war fertig codiert und im UI verdrahtet (`openProfile()`, `openSocial()`),
referenzierte aber ein Supabase-Projekt, für das **kein Server-Code im Repository
existierte** — kein `supabase/migrations`-Ordner, keine Edge Functions (siehe
AUDIT.md, "Nicht abschließend geprüft"). Ohne diesen Server-Code konnte sich niemand
einloggen; der Online-Modus war UI-Fassade ohne Fundament.

Diese Session liefert das fehlende Fundament: `supabase/migrations/0001_online_mode_init.sql`
(Schema, RLS, alle vom Client erwarteten RPCs) und `supabase/functions/{spin,gamble}`
(die zwei Edge Functions, die den Client-Vertrag `backend.requestSpin()` /
`backend.resolveGamble()` exakt erfüllen). Kein Byte im Client wurde für den
Online-Modus geändert — der bestehende Code brauchte keine Anpassung, ihm fehlte nur
das Gegenstück auf dem Server.

**Was in dieser Session tatsächlich verifiziert wurde** (siehe „Testnachweis" unten):
Migration und beide Edge Functions liefen gegen einen echten, lokal gestarteten
PostgreSQL-16-Server in dieser Sandbox — nicht nur gegen das Ziel-Supabase-Projekt.

**Was in dieser Session NICHT verifiziert werden konnte:** ein Deployment gegen das
echte Projekt `ucbkmlkxhfghfzgepkbl.supabase.co`, auf das `nova-casino.html` bereits
zeigt. Der ausgehende Netzwerkzugriff dieser Sandbox auf `*.supabase.co` ist durch
eine Organisationsrichtlinie blockiert — bestätigt über `curl` (`CONNECT tunnel
failed, response 403`), nicht nur vermutet. Ohne diesen Zugriff kann von hier aus
weder die Migration auf das echte Projekt angewendet noch eine echte Anmeldung end-to-end
bestätigt werden. Das folgt der eigenen Vorgabe des Masterprompts: *"Wenn Zugang
fehlt, liefere exakte Befehle und Dateien, aber behaupte keine Veröffentlichung."*

## Was zu tun ist, um es live zu schalten

Voraussetzung: Zugriff auf das Supabase-Projekt `ucbkmlkxhfghfzgepkbl` (Dashboard-Login
oder Access Token) sowie die [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1) CLI installieren (falls nicht vorhanden) und einloggen
npm install -g supabase
supabase login

# 2) Dieses Repository mit dem Projekt verknüpfen
supabase link --project-ref ucbkmlkxhfghfzgepkbl

# 3) Schema, RLS und RPCs anwenden
supabase db push

# 4) Beide Edge Functions deployen
supabase functions deploy spin
supabase functions deploy gamble

# 5) In Supabase Auth (Dashboard -> Authentication -> Providers) sicherstellen,
#    dass "Email" als Provider aktiv ist -- signUp()/signIn() im Client nutzen
#    ausschließlich E-Mail/Passwort (kein OAuth), siehe js/backend.js.
```

Danach braucht `nova-casino.html` **keine** Änderung — `window.NOVA_CONFIG` zeigt
bereits auf dieses Projekt, und der gesamte Login-/Spin-/Gamble-Client-Code ist
bereits fertig verdrahtet.

## Manuelle Abnahme nach dem Deployment (da hier nicht ausführbar)

1. `nova-casino.html` öffnen, Profil -> "Account erstellen" mit einer Test-E-Mail.
2. Prüfen: `profiles`, `wallets` (Startguthaben 100,00 €) und 4 Zeilen in
   `game_states` wurden für den neuen User angelegt (Trigger `on_auth_user_created`).
3. Einen Spin auf Shark Abyss auslösen, prüfen, dass `spins` eine Zeile bekommt und
   `wallets.balance_cents` korrekt fortgeschrieben wird.
4. Fruit Reactor spielen, bis eine Kartenrisiko-Runde öffnet; NEHMEN klicken, prüfen,
   dass `gamble_rounds.status='collected'` wird und das Guthaben erst *dann* steigt
   (nicht schon beim Gewinn-Spin).
5. Tab mitten im Spin neu laden (Netzwerk-Tab kurz auf "Offline" stellen, spinnen,
   sofort neu laden) -- der Spin darf weder doppelt bezahlt noch verloren gehen
   (idempotency_key-Schutz in `apply_spin_result`).
6. Zwei Test-Accounts per Freundescode verbinden, prüfen, dass Annahme und
   Aktivitäts-Feed (`client_sync_snapshot`) funktionieren.

## Testnachweis dieser Session

Da `*.supabase.co` von hier aus nicht erreichbar ist, wurde stattdessen gegen einen
echten, lokal gestarteten PostgreSQL 16 getestet (nicht simuliert, nicht nur gelesen):

- **Mathematik-Äquivalenz** (`supabase/functions/_shared/math.js` vs. dem
  Original-Code in `nova-casino.html`): 2700 Vergleiche über 300 Seeds, alle 4 Spiele
  plus Kartenzug — null Abweichungen. Das ist der Beweis, dass der Server exakt
  dieselbe RTP wie der Client liefert, nicht nur eine Behauptung.
- **Migration** (`0001_online_mode_init.sql`): angewendet auf einen frischen
  PostgreSQL-16-Server, inkl. eines Mini-Stubs für `auth.users`/`auth.uid()` (das
  echte Supabase stellt beides bereit; hier nachgebaut, um die Migration isoliert zu
  prüfen). Verifiziert: Signup-Trigger legt Profil/Wallet/4×Spielstatus an,
  `client_sync_snapshot`/`find_profile_by_friend_code`/`accept_friendship` liefern
  korrekte Daten, `apply_spin_result` bucht Einsatz/Gewinn korrekt (inkl. Freispiel
  ohne Einsatzabzug und Risikospiel mit zurückgehaltenem Gewinn), Idempotenz-Replay
  zahlt nicht doppelt aus, unzureichendes Guthaben wird abgelehnt.
- **Edge Functions** (`spin`, `gamble`): der tatsächliche Quellcode (nicht eine
  Kopie) wurde in einem Node-Harness geladen, das nur `Deno`/`createClient` durch
  echte Aufrufe an dieselbe PostgreSQL-Testdatenbank ersetzt — die eigentliche
  Kontrolllogik (Auth-Prüfung, Validierung, Fehler-Mapping, Response-Form) lief
  unverändert. Dabei wurden zwei echte Bugs gefunden und behoben: ein falscher
  Datei-Import (`http.js` statt `http.ts`) und eine Statusprüfung im
  Gamble-Handler, die eine legitime Idempotenz-Wiederholung fälschlich abgelehnt
  hätte. Nach der Korrektur: 401 ohne Login, 200 mit korrektem Presentation-Objekt,
  identischer Replay bei gleichem Idempotency-Key, 400 bei ungültigem Einsatz/
  unbekanntem Spiel, korrekt zurückgehaltener Risikospiel-Gewinn bis zum Collect,
  `gamble_pending` bei einer neuen Aktion auf eine bereits abgeschlossene Runde.
- **Client-Auth-UI** (`tests/online-mode-auth-ui.js`, neu, gegen echten Chromium):
  Gast sieht Login/Signup-Formular mit E-Mail/Passwort/Name, beide Buttons
  vorhanden, Weg zurück zum Gast-Reset bleibt erhalten. Ein echter (nicht simulierter)
  fehlgeschlagener Login gegen die blockierte `*.supabase.co`-Domain zeigt einen
  sauberen Fehler-Toast ("Keine Verbindung zum NOVA-Server.") statt eines Absturzes,
  die App bleibt danach voll bedienbar, null echte JS-Fehler.

Nicht verifiziert (siehe oben): ein tatsächliches Deployment gegen das reale
Supabase-Projekt und eine damit durchgeführte echte Anmeldung/Synchronisierung.
