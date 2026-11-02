# Forno di casa (PizzeriaMario)

## Cos'è
Webapp in italiano per organizzare una serata pizza: ricettario (pizze, speciali, ingredienti), menu della serata, lista della spesa aggregata e dati dell'impasto (peso, idratazione, panetti, maturazione). Le serate si salvano e si riaprono dal calendario. Accesso con email e password; i dati stanno su Supabase e si sincronizzano in tempo reale tra i dispositivi.

## Stack
- HTML, CSS e JavaScript puro. Nessun build, nessun package manager.
- `@supabase/supabase-js` 2.118.0 caricato da CDN in `index.html`.
- Hosting: GitHub Pages, <https://marione1982.github.io/PizzeriaMario/>.

## File
- `index.html`: struttura, accesso e finestre di dialogo.
- `app.js`: tutta la logica (stato, rendering, autenticazione, sincronizzazione).
- `styles.css`: stile responsive.
- `supabase-config.js`: URL del progetto e chiave publishable (pubblica per progetto).
- `supabase/schema.sql`: schema completo del database, rieseguibile.
- `.github/workflows/deploy.yml`: pubblica su GitHub Pages a ogni push su `main`.

## Avvio locale
`python3 -m http.server 3000`, poi apri `http://localhost:3000`. Con `file://` il login non funziona.

## Deploy
Un push su `main` pubblica il sito. Il tag script di `app.js` in `index.html` ha un parametro `?v=...`: aggiornalo quando cambi `app.js`, così i browser non usano la versione in cache.

## Supabase
- Progetto "Pizzeria da Mario" (ref `xtgtnbjpludhdjqrkiqh`, regione eu-central-1).
- Tabelle: `ingredients`, `pizzas`, `pizza_ingredients`, `specials`, `special_ingredients`, `pizza_events`, `event_pizzas`, `event_specials`.
- Ogni tabella ha `user_id`, chiave primaria `(user_id, id)`, RLS attiva e una policy che limita l'accesso al proprietario. Gli `id` sono testo (uuid come stringa).
- Sincronizzazione: il client carica tutto con `loadCloudState` e salva uno snapshot completo con `syncCloudSnapshot`. Lo snapshot cancella dal cloud ingredienti, pizze e speciali che non esistono più nello stato locale, e riscrive per intero `pizza_ingredients` e `special_ingredients`. Uno stato locale obsoleto può quindi eliminare dati creati da un altro dispositivo: vai cauto quando tocchi questa logica.
- Il client scrive sempre `unit = 'pz'` e quantità 1; le colonne `unit`, `quantity_per_pizza` e `quantity_per_preparation` esistono ma l'interfaccia non le usa ancora.
- Il realtime ascolta tutte e 8 le tabelle (`subscribeToUserData` in `app.js`): ogni tabella nuova va aggiunta sia lì sia alla publication `supabase_realtime`.

## Regole di lavoro
- Prima di cambiare il database, leggi lo stato reale (tabelle, migrazioni, policy). Mostra l'SQL e aspetta conferma prima di applicarlo.
- Ogni modifica al database passa da una migrazione con nome descrittivo, e `supabase/schema.sql` si aggiorna nello stesso lavoro, così il repo resta uguale al database.
- Ogni tabella nuova: RLS attiva, policy per il proprietario, `revoke all ... from anon`, `grant` ad `authenticated`.
- Mai `service_role` né chiavi segrete nel browser o nel repo: il repository è pubblico. Nel client va solo la chiave publishable.
- Gli indirizzi autorizzati per l'accesso si configurano in Authentication → URL Configuration: `http://localhost:3000/**` e `https://marione1982.github.io/PizzeriaMario/**`.

## Convenzioni
- Testi dell'interfaccia in italiano.
- Segui lo stile esistente di `app.js` (funzioni compatte, nessun framework).
- Messaggi di commit brevi, in italiano.
