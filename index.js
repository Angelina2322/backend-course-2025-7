import { Command } from "commander";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

const program = new Command();

program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <path>", "path to cache directory");

program.parse(process.argv);
const options = program.opts();

// Перевіряємо директорію кешу
if (!fs.existsSync(options.cache)) {
  console.log(`Cache directory not found. Creating: ${options.cache}`);
  fs.mkdirSync(options.cache, { recursive: true });
}

// ===================== EXPRESS SERVER =====================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===================== MULTER =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, options.cache),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// ===================== БАЗА ДАНИХ =====================
let inventory = [];

// ===================== SWAGGER =====================
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.0.0",
      description: "API для реєстрації та пошуку пристроїв"
    },
    servers: [{ url: `http://localhost:${options.port}` }]
  },
  apis: ["/app/index.js"]
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ===================== ЕНДПОІНТИ =====================

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     tags:
 *       - Inventory
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва пристрою
 *               description:
 *                 type: string
 *                 description: Опис пристрою
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото пристрою
 *     responses:
 *       201:
 *         description: Пристрій успішно створено
 *       400:
 *         description: Не передано inventory_name
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.status(400).json({ error: "inventory_name is required" });

  const newItem = {
    id: inventory.length > 0 ? inventory[inventory.length - 1].id + 1 : 1,
    inventory_name,
    description: description || "",
    photo: req.file ? req.file.filename : null
  };

  inventory.push(newItem);
  res.status(201).json(newItem);
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати всі пристрої
 *     tags:
 *       - Inventory
 *     responses:
 *       200:
 *         description: Список пристроїв
 */
app.get("/inventory", (req, res) => res.json(inventory));

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інформацію про конкретний пристрій
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Інформація про пристрій
 *       404:
 *         description: Пристрій не знайдено
 */
app.get("/inventory/:id", (req, res) => {
  const item = inventory.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлення даних пристрою
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва пристрою
 *               description:
 *                 type: string
 *                 description: Опис пристрою
 *     responses:
 *       200:
 *         description: Дані оновлено
 *       404:
 *         description: Пристрій не знайдено
 */
app.put("/inventory/:id", (req, res) => {
  const item = inventory.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });

  const { inventory_name, description } = req.body;
  if (inventory_name) item.inventory_name = inventory_name;
  if (description) item.description = description;

  res.json(item);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото пристрою
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Фото пристрою
 *       404:
 *         description: Фото не знайдено
 */
app.get("/inventory/:id/photo", (req, res) => {
  const item = inventory.find(i => i.id === parseInt(req.params.id));
  if (!item || !item.photo) return res.status(404).json({ error: "Not found" });
  const photoPath = path.join(options.cache, item.photo);
  if (!fs.existsSync(photoPath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(photoPath);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлення фото пристрою
 *     tags:
 *       - Inventory
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
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото пристрою
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Пристрій не знайдено
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const item = inventory.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  if (item.photo) {
    const oldPhotoPath = path.join(options.cache, item.photo);
    if (fs.existsSync(oldPhotoPath)) fs.unlinkSync(oldPhotoPath);
  }

  item.photo = req.file.filename;
  res.json(item);
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалення пристрою
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Пристрій видалено
 *       404:
 *         description: Пристрій не знайдено
 */
app.delete("/inventory/:id", (req, res) => {
  const index = inventory.findIndex(i => i.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Not found" });

  const deletedItem = inventory.splice(index, 1)[0];
  if (deletedItem.photo) {
    const photoPath = path.join(options.cache, deletedItem.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  res.json(deletedItem);
});

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Форма для реєстрації пристрою
 *     tags:
 *       - Forms
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get("/RegisterForm.html", (req, res) =>
  res.sendFile(path.join(process.cwd(), "public", "RegisterForm.html"))
);

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Форма для пошуку пристрою
 *     tags:
 *       - Forms
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get("/SearchForm.html", (req, res) =>
  res.sendFile(path.join(process.cwd(), "public", "SearchForm.html"))
);

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук пристрою за ID
 *     tags:
 *       - Inventory
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: ID пристрою
 *               has_photo:
 *                 type: boolean
 *                 description: Повернути фото чи ні
 *     responses:
 *       200:
 *         description: Пристрій знайдено
 *       404:
 *         description: Пристрій не знайдено
 */
app.post("/search", (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventory.find(i => i.id === parseInt(id));
  if (!item) return res.status(404).json({ error: "Not found" });

  const result = { ...item };
  if (!has_photo) delete result.photo;
  res.json(result);
});

// ===================== 405 =====================
app.use((req, res) => res.status(405).json({ error: "Method not allowed" }));

// ===================== START SERVER =====================
app.listen(options.port, options.host, () =>
  console.log(`Server running at http://${options.host}:${options.port}/`)
);
