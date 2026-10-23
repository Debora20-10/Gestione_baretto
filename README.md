# Gestione Baretto

Applicazione per la gestione di un bar. Il progetto usa Node.js, Express e MySQL 8; Docker Compose avvia il database e il server Express espone i file statici e un endpoint di stato.

## Requisiti

- Node.js 24 o successivo e npm
- Docker con Docker Compose v2

## Configurazione

Installa le dipendenze:

```sh
npm ci
```

Crea un file `.env` nella cartella principale del progetto con i parametri di connessione:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=utente
DB_PASSWORD=password
DB_NAME=baretto
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=sostituisci-con-una-password-lunga
```

`PORT` è facoltativa e predefinita a `3000`. Gli altri valori DB corrispondono alla configurazione di sviluppo in `docker-compose.yml`. Se modifichi utente o password, aggiorna anche le variabili `MYSQL_USER` e `MYSQL_PASSWORD` del servizio MySQL. Sostituisci le credenziali admin di esempio con valori personali e non condividere né aggiungere al controllo versione il file `.env`.

## Avvio

Avvia il database:

```sh
docker compose up -d mysql
```

Verifica che MySQL abbia terminato l'avvio:

```sh
docker compose exec -T mysql mysqladmin ping -h localhost --silent
```

Quando il comando risponde `mysqld is alive`, avvia Express:

```sh
npm start
```

All'avvio vengono create o verificate le tabelle `prodotti`, `personale` e `ordini`. Se tutte e tre sono vuote, vengono inseriti dati dimostrativi; i dati già presenti non vengono modificati. Il server resta in ascolto su `http://localhost:3000` (o sulla porta impostata in `PORT`). La pagina pubblica degli ordini è disponibile alla radice `/`; il pannello admin è su `/admin` e si può aprire con il pulsante **Accesso admin** nella pagina pubblica, usando le credenziali `ADMIN_USERNAME` e `ADMIN_PASSWORD` configurate in `.env`. Il login crea una sessione valida per otto ore. Le API `GET /api/prodotti`, `GET /api/personale` e `GET /api/ordini` sono riservate all'admin. La vista pubblica usa `GET /api/public/ordini`, che non restituisce note, prezzi o dati del personale. `GET /api/health` verifica la connessione al database:

```sh
curl http://localhost:3000/api/health
```

La risposta attesa è `{"status":"ok","database":"connected"}`. Ferma Express con `Ctrl+C`, poi, se necessario, ferma il database senza eliminare i dati:

```sh
docker compose down
```

I dati MySQL persistono nel volume Docker `mysql_data`. `docker compose down -v` elimina anche il volume e i dati.

Per controllare direttamente le tabelle del database:

```bash
docker exec -it mysql-dev mysql -uutente -ppassword -Dbaretto
```
