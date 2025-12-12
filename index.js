import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

// ===================== CONFIG =====================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CACHE_DIR = process.env.CACHE_DIR || './cache';
const DB_HOST = process.env.DB_HOST || 'backend_db';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || 'rootpassword';
const DB_NAME = process.env.DB_NAME || 'inventorydb';

// Створюємо кеш-директорію, якщо її немає
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ===================== MYSQL =====================
let db;
while (!db) {
  try {
    db = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });
    console.log('✅ MySQL підключено');
  } catch (err) {
    console.log('⏳ Чекаю MySQL...');
    await new Promise(res => setTimeout(res, 2000)); // чекаємо 2 секунди
  }
}

// Створимо таблицю, якщо не існує
await db.execute(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_name VARCHAR(255) NOT NULL,
    description TEXT,
    photo VARCHAR(255)
  )
`);

// ===================== EXPRESS SERVER =====================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===================== MULTER =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CACHE_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// ===================== SWAGGER =====================
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API для реєстрації та пошуку пристроїв'
    },
    servers: [{ url: `http://localhost:${PORT}` }]
  },
  apis: ['./index.js']
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ===================== ENDPOINTS =====================

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Додати новий пристрій
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Пристрій додано
 */
app.post('/register', upload.single('photo'), async (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.status(400).json({ error: 'inventory_name is required' });

  const [result] = await db.execute(
    'INSERT INTO inventory (inventory_name, description, photo) VALUES (?, ?, ?)',
    [inventory_name, description || '', req.file ? req.file.filename : null]
  );

  const [item] = await db.execute('SELECT * FROM inventory WHERE id = ?', [result.insertId]);
  res.status(201).json(item[0]);
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список усіх пристроїв
 *     responses:
 *       200:
 *         description: Список пристроїв
 */
app.get('/inventory', async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM inventory');
  res.json(rows);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати пристрій за id
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Деталі пристрою
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id', async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити пристрій
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Оновлено
 *       404:
 *         description: Не знайдено
 */
app.put('/inventory/:id', upload.single('photo'), async (req, res) => {
  const { inventory_name, description } = req.body;
  const [existing] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });

  let photoFile = existing[0].photo;
  if (req.file && photoFile) {
    const oldPath = path.join(CACHE_DIR, photoFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    photoFile = req.file.filename;
  } else if (req.file) {
    photoFile = req.file.filename;
  }

  await db.execute(
    'UPDATE inventory SET inventory_name = ?, description = ?, photo = ? WHERE id = ?',
    [inventory_name || existing[0].inventory_name, description || existing[0].description, photoFile, req.params.id]
  );

  const [updated] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  res.json(updated[0]);
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити пристрій
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 */
app.delete('/inventory/:id', async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const photoFile = rows[0].photo;
  if (photoFile) {
    const fp = path.join(CACHE_DIR, photoFile);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  await db.execute('DELETE FROM inventory WHERE id = ?', [req.params.id]);
  res.json({ ok: true, deleted_id: Number(req.params.id) });
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото пристрою
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Фото
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id/photo', async (req, res) => {
  const [rows] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  if (!rows.length || !rows[0].photo) return res.status(404).json({ error: 'Not found' });

  const photoPath = path.join(CACHE_DIR, rows[0].photo);
  if (!fs.existsSync(photoPath)) return res.status(404).json({ error: 'File not found' });

  res.sendFile(photoPath);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото пристрою
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Не знайдено
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const [existing] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });

  if (!req.file) return res.status(400).json({ error: 'photo is required' });

  const oldPhoto = existing[0].photo;
  if (oldPhoto) {
    const oldPath = path.join(CACHE_DIR, oldPhoto);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  await db.execute('UPDATE inventory SET photo = ? WHERE id = ?', [req.file.filename, req.params.id]);
  const [updated] = await db.execute('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
  res.json(updated[0]);
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Шукати пристрій за inventory_name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Результати пошуку
 */
app.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const [rows] = await db.execute(
    'SELECT * FROM inventory WHERE inventory_name LIKE ?',
    [`%${query}%`]
  );
  res.json(rows);
});


// ===================== START SERVER =====================
app.listen(PORT, HOST, () => console.log(`🚀 Server running at http://${HOST}:${PORT}`));

