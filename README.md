# Forno di casa

Webapp in italiano per organizzare una serata pizza, comporre un menu dal proprio ricettario e ricavare una lista della spesa aggregata. Ricette, ingredienti e serata vengono sincronizzati su Supabase dopo l'accesso con link email.

## Avvio

Avvia un server statico dalla cartella del progetto, ad esempio `python3 -m http.server 3000`, e visita `http://localhost:3000`. L'accesso cloud richiede un'origine `http://` o `https://`; aprire direttamente `index.html` (`file://`) non consente il login.

Date, numero di invitati, pizze e ingredienti vengono salvati su Supabase. La lista combina gli ingredienti delle pizze selezionate: se sei pizze usano mozzarella, mostra `× 6`. Le spunte della spesa sono salvate localmente nel browser.

## Supabase

Collegamento al progetto `Pizzeria da Mario` tramite `supabase-config.js`. Lo schema in `supabase/schema.sql` è stato applicato al database: le tabelle usano RLS e ogni utente autenticato vede soltanto i propri dati.

L'accesso usa link email monouso. Se Supabase rifiuta il redirect, aggiungi `http://localhost:3000/**` all'elenco Redirect URLs in Authentication → URL Configuration. La chiave publishable presente nel client è pubblica per progetto; non inserire mai una chiave `service_role` o una chiave segreta nel browser.

## GitHub

Repository di destinazione: [`Marione1982/PizzeriaMario`](https://github.com/Marione1982/PizzeriaMario). Il push del codice è in attesa che l'integrazione GitHub disponga dell'autorizzazione a scrivere i contenuti.

## Contenuti

- `index.html`: struttura, form di accesso e moduli dell'app.
- `styles.css`: layout responsive e stile da pizzeria artigianale.
- `app.js`: interazioni, autenticazione e sincronizzazione dati.
- `supabase-config.js`: URL del progetto e chiave publishable.
- `supabase/schema.sql`: schema del database con policy RLS.
