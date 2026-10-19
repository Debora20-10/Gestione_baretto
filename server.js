'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const mysql = require('mysql2/promise');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
	process.loadEnvFile(envPath);
}

const pool = mysql.createPool({
	host: process.env.DB_HOST || '127.0.0.1',
	port: Number(process.env.DB_PORT || 3306),
	user: process.env.DB_USER || 'utente',
	password: process.env.DB_PASSWORD || 'password',
	database: process.env.DB_NAME || 'baretto',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

const app = express();
app.use(express.json());

const adminSessionDuration = 8 * 60 * 60 * 1000;

function constantTimeEqual(left, right) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAdminCredentialsValid(username, password) {
	return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD)
		&& constantTimeEqual(username, process.env.ADMIN_USERNAME)
		&& constantTimeEqual(password, process.env.ADMIN_PASSWORD);
}

function getCookie(request, name) {
	const cookies = request.get('cookie') || '';
	for (const cookie of cookies.split(';')) {
		const separator = cookie.indexOf('=');
		if (separator !== -1 && cookie.slice(0, separator).trim() === name) {
			return cookie.slice(separator + 1).trim();
		}
	}
	return '';
}

function isAdminSessionValid(request) {
	if (!process.env.ADMIN_PASSWORD) return false;

	const [expiresAtValue, signature, ...extra] = getCookie(request, 'baretto_admin').split('.');
	const expiresAt = Number(expiresAtValue);
	if (extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !signature) {
		return false;
	}

	const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD)
		.update(String(expiresAt))
		.digest('base64url');
	return constantTimeEqual(signature, expectedSignature);
}

function requireAdmin(request, response, next) {
	const username = process.env.ADMIN_USERNAME;
	const password = process.env.ADMIN_PASSWORD;
	if (!username || !password) {
		return response.status(503).send('Accesso admin non configurato. Imposta ADMIN_USERNAME e ADMIN_PASSWORD nel file .env.');
	}
	if (isAdminSessionValid(request)) return next();

	const authorization = request.get('authorization') || '';
	const match = authorization.match(/^Basic\s+(.+)$/i);
	const suppliedCredentials = match ? Buffer.from(match[1], 'base64').toString('utf8') : '';
	const separator = suppliedCredentials.indexOf(':');
	const authenticated = separator !== -1
		&& isAdminCredentialsValid(suppliedCredentials.slice(0, separator), suppliedCredentials.slice(separator + 1));

	if (!authenticated) {
		response.set('WWW-Authenticate', 'Basic realm="Gestione Baretto Admin", charset="UTF-8"');
		return response.status(401).send('Credenziali admin richieste.');
	}

	return next();
}

app.post('/api/admin/login', (request, response) => {
	if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
		return response.status(503).json({ message: 'Accesso admin non configurato.' });
	}

	const { username, password } = request.body || {};
	if (typeof username !== 'string' || typeof password !== 'string' || !isAdminCredentialsValid(username, password)) {
		return response.status(401).json({ message: 'Utente o password non corretti.' });
	}

	const expiresAt = Date.now() + adminSessionDuration;
	const signature = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD)
		.update(String(expiresAt))
		.digest('base64url');
	const secureCookie = process.env.NODE_ENV === 'production' || request.secure ? '; Secure' : '';
	response.set('Set-Cookie', `baretto_admin=${expiresAt}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${adminSessionDuration / 1000}${secureCookie}`);
	return response.json({ success: true });
});

app.post('/api/admin/logout', (request, response) => {
	response.set('Set-Cookie', 'baretto_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
	return response.redirect(303, '/');
});

app.get('/', (request, response) => {
	response.sendFile(path.join(__dirname, 'public', 'ordini.html'));
});

app.get(['/admin', '/admin.html', '/index.html'], requireAdmin, (request, response) => {
	response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', async (request, response) => {
	try {
		await pool.query('SELECT 1');
		response.json({ status: 'ok', database: 'connected' });
	} catch {
		response.status(503).json({ status: 'error', database: 'disconnected' });
	}
});

app.get('/api/prodotti', requireAdmin, async (request, response) => {
	const [prodotti] = await pool.query('SELECT * FROM prodotti ORDER BY nome');
	response.json(prodotti);
});

app.get('/api/personale', requireAdmin, async (request, response) => {
	const [personale] = await pool.query('SELECT * FROM personale ORDER BY cognome, nome');
	response.json(personale);
});

app.get('/api/ordini', requireAdmin, async (request, response) => {
	const [ordini] = await pool.query(`
		SELECT ordini.*, prodotti.nome AS prodotto_nome,
			personale.nome AS personale_nome, personale.cognome AS personale_cognome
		FROM ordini
		JOIN prodotti ON prodotti.id = ordini.prodotto_id
		LEFT JOIN personale ON personale.id = ordini.personale_id
		ORDER BY ordini.creato_il DESC, ordini.id DESC
	`);
	response.json(ordini);
});

app.get('/api/public/ordini', async (request, response) => {
	const [ordini] = await pool.query(`
		SELECT ordini.id, ordini.quantita, ordini.stato, prodotti.nome AS prodotto_nome
		FROM ordini
		JOIN prodotti ON prodotti.id = ordini.prodotto_id
		ORDER BY ordini.creato_il DESC, ordini.id DESC
	`);
	response.json(ordini);
});

app.get('/api/public/prodotti', async (request, response) => {
	const [prodotti] = await pool.query(`
		SELECT id, nome, descrizione, categoria, prezzo
		FROM prodotti
		WHERE disponibile = TRUE
		ORDER BY categoria, nome
	`);
	response.json(prodotti);
});

app.post('/api/public/ordini', async (request, response) => {
	const { items, paymentMethod } = request.body || {};
	const validPaymentMethods = ['contanti', 'carta'];

	if (!Array.isArray(items) || items.length === 0 || items.length > 30
		|| !validPaymentMethods.includes(paymentMethod)) {
		return response.status(400).json({ message: 'Ordine o metodo di pagamento non valido.' });
	}
	if (items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
		return response.status(400).json({ message: 'Gli articoli del carrello non sono validi.' });
	}

	const normalizedItems = items.map((item) => ({
		productId: Number(item.productId),
		quantity: Number(item.quantity),
	}));
	if (normalizedItems.some((item) => !Number.isSafeInteger(item.productId) || item.productId < 1
		|| !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
		|| new Set(normalizedItems.map((item) => item.productId)).size !== normalizedItems.length) {
		return response.status(400).json({ message: 'Gli articoli del carrello non sono validi.' });
	}

	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const productIds = normalizedItems.map((item) => item.productId);
		const [prodotti] = await connection.query(
			'SELECT id, prezzo FROM prodotti WHERE disponibile = TRUE AND id IN (?) FOR UPDATE',
			[productIds]
		);
		if (prodotti.length !== normalizedItems.length) {
			await connection.rollback();
			return response.status(409).json({ message: 'Uno o più prodotti non sono più disponibili.' });
		}

		const productPricesInCents = new Map(
			prodotti.map((prodotto) => [Number(prodotto.id), priceInCents(prodotto.prezzo)])
		);
		const orderIds = [];
		let totalCents = 0;
		for (const item of normalizedItems) {
			const priceCents = productPricesInCents.get(item.productId);
			totalCents += priceCents * item.quantity;
			const [result] = await connection.query(
				`INSERT INTO ordini
					(prodotto_id, quantita, prezzo_unitario, metodo_pagamento, note)
				 VALUES (?, ?, ?, ?, 'Ordine self-service')`,
				[item.productId, item.quantity, priceCents / 100, paymentMethod]
			);
			orderIds.push(result.insertId);
		}

		await connection.commit();
		return response.status(201).json({ orderIds, total: totalCents / 100 });
	} catch (error) {
		await connection.rollback();
		console.error('Impossibile registrare l’ordine self-service:', error.message);
		return response.status(500).json({ message: 'Impossibile completare l’ordine.' });
	} finally {
		connection.release();
	}
});

function priceInCents(prezzo) {
	return Math.round(Number(prezzo) * 100);
}

app.get('/menu', (request, response) => {
	response.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

async function initializeDatabase() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS prodotti (
			id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			nome VARCHAR(120) NOT NULL,
			descrizione TEXT,
			categoria VARCHAR(80),
			prezzo DECIMAL(10, 2) NOT NULL,
			disponibile BOOLEAN NOT NULL DEFAULT TRUE,
			creato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			aggiornato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			CONSTRAINT chk_prodotti_prezzo CHECK (prezzo >= 0)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS personale (
			id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			nome VARCHAR(100) NOT NULL,
			cognome VARCHAR(100) NOT NULL,
			ruolo VARCHAR(80) NOT NULL,
			email VARCHAR(255) UNIQUE,
			telefono VARCHAR(30),
			attivo BOOLEAN NOT NULL DEFAULT TRUE,
			creato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS ordini (
			id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
			prodotto_id INT UNSIGNED NOT NULL,
			personale_id INT UNSIGNED,
			quantita INT UNSIGNED NOT NULL DEFAULT 1,
			prezzo_unitario DECIMAL(10, 2) NOT NULL,
			metodo_pagamento ENUM('contanti', 'carta') NULL,
			stato ENUM('in_attesa', 'in_preparazione', 'completato', 'annullato') NOT NULL DEFAULT 'in_attesa',
			note VARCHAR(500),
			creato_il TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT chk_ordini_quantita CHECK (quantita > 0),
			CONSTRAINT chk_ordini_prezzo CHECK (prezzo_unitario >= 0),
			CONSTRAINT fk_ordini_prodotto FOREIGN KEY (prodotto_id)
				REFERENCES prodotti (id) ON DELETE RESTRICT,
			CONSTRAINT fk_ordini_personale FOREIGN KEY (personale_id)
				REFERENCES personale (id) ON DELETE SET NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`);

	const [paymentColumns] = await pool.query("SHOW COLUMNS FROM ordini LIKE 'metodo_pagamento'");
	if (paymentColumns.length === 0) {
		await pool.query("ALTER TABLE ordini ADD COLUMN metodo_pagamento ENUM('contanti', 'carta') NULL");
	}

	await seedDatabaseIfEmpty();
}

async function seedDatabaseIfEmpty() {
	const connection = await pool.getConnection();

	try {
		await connection.beginTransaction();
		const [[counts]] = await connection.query(`
			SELECT
				(SELECT COUNT(*) FROM prodotti) AS prodotti,
				(SELECT COUNT(*) FROM personale) AS personale,
				(SELECT COUNT(*) FROM ordini) AS ordini
		`);

		if (Number(counts.prodotti) === 0 && Number(counts.personale) === 0 && Number(counts.ordini) === 0) {
			await connection.query(`
				INSERT INTO prodotti (nome, descrizione, categoria, prezzo, disponibile) VALUES
					('Caffè espresso', 'Espresso dalla miscela della casa', 'Caffetteria', 1.20, TRUE),
					('Cappuccino', 'Espresso con latte montato', 'Caffetteria', 1.60, TRUE),
					('Cornetto', 'Cornetto fresco del giorno', 'Colazione', 1.40, TRUE),
					('Spremuta arancia', 'Spremuta fresca', 'Bevande', 3.50, TRUE),
					('Panino prosciutto e formaggio', 'Panino caldo con prosciutto e formaggio', 'Panini', 5.50, TRUE),
					('Acqua naturale', 'Bottiglia da 0,5 l', 'Bevande', 1.00, TRUE),
					('Brioche alla crema', 'Brioche fresca ripiena di crema pasticcera', 'Colazione', 1.60, TRUE),
					('Toast prosciutto e formaggio', 'Toast caldo con prosciutto cotto e formaggio', 'Panini', 4.50, TRUE),
					('Focaccia farcita', 'Focaccia morbida farcita con ingredienti freschi', 'Panini', 4.00, TRUE),
					('Tè caldo', 'Tè in infusione, servito caldo', 'Caffetteria', 1.50, TRUE),
					('Tè freddo al limone', 'Tè freddo al limone', 'Bevande', 2.50, TRUE),
					('Bibita cola', 'Lattina da 0,33 l', 'Bevande', 2.50, TRUE),
					('Pasta al pomodoro', 'Pasta con salsa di pomodoro e basilico', 'Pranzo', 7.50, TRUE),
					('Insalata caprese', 'Pomodoro, mozzarella e basilico fresco', 'Pranzo', 7.00, TRUE),
					('Lasagna al ragù', 'Lasagna al forno con ragù e besciamella', 'Pranzo', 8.50, TRUE),
					('Pizza margherita', 'Pizza con pomodoro, mozzarella e basilico', 'Pranzo', 8.00, TRUE)
			`);

			await connection.query(`
				INSERT INTO personale (nome, cognome, ruolo, email, telefono, attivo) VALUES
					('Marco', 'Rossi', 'Barista', 'marco.rossi@example.test', '3330000001', TRUE),
					('Giulia', 'Bianchi', 'Addetta alla cassa', 'giulia.bianchi@example.test', '3330000002', TRUE),
					('Luca', 'Verdi', 'Cameriere', 'luca.verdi@example.test', '3330000003', TRUE)
			`);

			await connection.query(`
				INSERT INTO ordini (prodotto_id, personale_id, quantita, prezzo_unitario, stato, note) VALUES
					((SELECT id FROM prodotti WHERE nome = 'Caffè espresso'), (SELECT id FROM personale WHERE email = 'marco.rossi@example.test'), 2, 1.20, 'completato', 'Tavolo 1'),
					((SELECT id FROM prodotti WHERE nome = 'Cappuccino'), (SELECT id FROM personale WHERE email = 'giulia.bianchi@example.test'), 1, 1.60, 'in_preparazione', 'Da asporto'),
					((SELECT id FROM prodotti WHERE nome = 'Panino prosciutto e formaggio'), (SELECT id FROM personale WHERE email = 'luca.verdi@example.test'), 1, 5.50, 'in_attesa', 'Tavolo 3'),
					((SELECT id FROM prodotti WHERE nome = 'Spremuta arancia'), NULL, 1, 3.50, 'completato', 'Senza addetto assegnato')
			`);
		}

		await connection.commit();
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

async function startServer() {
	await initializeDatabase();

	const port = Number(process.env.PORT || 3000);
	const host = process.env.HOST || '0.0.0.0';

	return new Promise((resolve, reject) => {
		const server = app.listen(port, host, () => {
			console.log(`Server Express in ascolto sulla porta ${port}.`);
			resolve(server);
		});

		server.once('error', reject);
	});
}

if (require.main === module) {
	startServer()
		.then((server) => {
			const shutdown = () => {
				server.close(() => {
					pool.end().catch((error) => {
						console.error('Errore durante la chiusura del database:', error.message);
					});
				});
			};

			process.once('SIGINT', shutdown);
			process.once('SIGTERM', shutdown);
		})
		.catch(async (error) => {
			console.error('Impossibile avviare il server:', error.message);
			await pool.end();
			process.exitCode = 1;
		});
}

module.exports = { app, pool, initializeDatabase, startServer };
