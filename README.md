# Forno di casa

Webapp in italiano per organizzare una serata pizza, comporre un menu dal proprio ricettario e ricavare una lista della spesa aggregata. Ricette, ingredienti, serata e spunte della spesa vengono sincronizzati in tempo reale su Supabase dopo l'accesso con email e password.

## Avvio

Avvia un server statico dalla cartella del progetto, ad esempio `python3 -m http.server 3000`, e visita `http://localhost:3000`. L'accesso cloud richiede un'origine `http://` o `https://`; aprire direttamente `index.html` (`file://`) non consente il login.

La data della serata si sceglie da un calendario. Pizze e ingredienti possono essere aggiunti, modificati o rimossi; le modifiche aggiornano anche il menu e la lista della spesa. Ogni serata salvata conserva data, invitati, menu e spunte della lista; puoi riaprirla, eliminarla o iniziarne una nuova dal calendario delle serate. Le modifiche si sincronizzano tra dispositivi aperti. La lista combina gli ingredienti delle pizze selezionate: se sei pizze usano mozzarella, mostra `× 6`.

## Supabase

Collegamento al progetto `Pizzeria da Mario` tramite `supabase-config.js`. Lo schema in `supabase/schema.sql` è applicato al database; `pizza_events` permette più serate per utente. Tutte le tabelle usano RLS e ogni utente autenticato vede soltanto i propri dati.

L'accesso usa email e password, con conferma email alla registrazione e recupero password via email. Gli account creati in precedenza con link monouso possono impostare la prima password scegliendo “Password dimenticata?”. In Authentication → URL Configuration aggiungi gli indirizzi autorizzati: `http://localhost:3000/**` per uso locale e `https://marione1982.github.io/PizzeriaMario/**` per il sito pubblico. La chiave publishable presente nel client è pubblica per progetto; non inserire mai una chiave `service_role` o una chiave segreta nel browser.

## GitHub

Repository del progetto: [`Marione1982/PizzeriaMario`](https://github.com/Marione1982/PizzeriaMario).

Il workflow in `.github/workflows/deploy.yml` pubblica il sito su GitHub Pages a ogni push su `main`, dopo avere impostato **Settings → Pages → Source → GitHub Actions**. URL previsto: <https://marione1982.github.io/PizzeriaMario/>.

## Contenuti

- `index.html`: struttura, form di accesso e moduli dell'app.
- `styles.css`: layout responsive e stile da pizzeria artigianale.
- `app.js`: interazioni, autenticazione e sincronizzazione dati.
- `supabase-config.js`: URL del progetto e chiave publishable.
- `supabase/schema.sql`: schema del database con policy RLS.
