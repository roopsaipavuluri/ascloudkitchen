require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { randomBytes } = require('crypto');

const { state, seedData } = require('./db');
const {
  deleteImage,
  initializePersistence,
  readImage,
  saveState,
  storeImage
} = require('./persistence');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is unset. Generated a temporary secret; sessions will not persist after a restart.');
}
const uploadsDirectory = path.resolve(__dirname, '..', 'uploads');
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error('Choose a JPEG, PNG, or WebP image.'));
    }
    callback(null, true);
  }
});

seedData();

app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
let persistenceQueue = Promise.resolve();
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) return sendJson(body);

    const write = persistenceQueue.then(() => saveState(state));
    persistenceQueue = write.catch(() => {});
    write.then(
      () => sendJson(body),
      (error) => {
        console.error('Request changes could not be persisted.', error);
        if (!res.headersSent) {
          res.status(500);
          sendJson({ message: 'Changes could not be saved. Please retry.' });
        }
      }
    );
    return res;
  };
  next();
});
app.use('/uploads', express.static(uploadsDirectory));

app.get('/api/media/:id', async (req, res) => {
  try {
    const image = await readImage(req.params.id);
    if (!image) return res.status(404).json({ message: 'Image not found.' });
    const imageBytes = Buffer.isBuffer(image.data)
      ? image.data
      : image.data.buffer.subarray(0, image.data.position);
    res.type(image.contentType).set('Cache-Control', 'public, max-age=31536000, immutable').send(imageBytes);
  } catch (error) {
    console.error('Stored image could not be loaded.', error);
    res.status(500).json({ message: 'Image could not be loaded.' });
  }
});

function deleteImageAfterSave(res, imagePath, context) {
  if (!imagePath) return;
  res.once('finish', () => {
    if (res.statusCode >= 400) return;
    deleteImage(imagePath).catch((error) => {
      console.error(`${context} could not be removed after saving the update.`, error);
    });
  });
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function getNextId(collection) {
  return collection.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1;
}

function getUserByEmail(email) {
  return state.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());
}

function getUserById(id) {
  return state.users.find((user) => Number(user.id) === Number(id));
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }
    req.user = sanitizeUser(user);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

function applyCoupon(code, subtotal) {
  const coupon = state.coupons.find((item) => item.code.toUpperCase() === String(code).toUpperCase() && item.active);
  if (!coupon) return 0;
  if (subtotal < Number(coupon.minOrder || 0)) return 0;

  if (coupon.type === 'percentage') {
    const amount = (subtotal * Number(coupon.value)) / 100;
    return Math.min(amount, Number(coupon.maxDiscount || amount));
  }

  return Math.min(Number(coupon.value), Number(coupon.maxDiscount || Number(coupon.value)));
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function validateImageBuffer(file) {
  const image = file.buffer;
  const checks = {
    'image/jpeg': image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff,
    'image/png': image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
  };
  const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  return checks[file.mimetype] ? extensions[file.mimetype] : null;
}

function parseFoodPayload(payload, existing = {}) {
  const name = String(payload.name ?? existing.name ?? '').trim();
  const price = Number(payload.price ?? existing.price);
  const discountPrice = Number(payload.discountPrice ?? existing.discountPrice ?? 0);
  const categoryId = Number(payload.categoryId ?? existing.categoryId);
  const preparationTime = Number(payload.preparationTime ?? existing.preparationTime ?? 20);
  const stock = Number(payload.stock ?? existing.stock ?? 0);
  const portionAmountValue = payload.portionAmount ?? existing.portionAmount ?? null;
  const portionAmount = portionAmountValue === '' || portionAmountValue === null ? null : Number(portionAmountValue);
  const portionUnit = String(payload.portionUnit ?? existing.portionUnit ?? 'g').trim().toLowerCase();

  if (!name) return { error: 'Food name is required.' };
  if (!Number.isFinite(price) || price <= 0) return { error: 'Price must be greater than zero.' };
  if (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > price) {
    return { error: 'Discount price must be between zero and the regular price.' };
  }
  if (!Number.isInteger(categoryId) || !state.categories.some((category) => Number(category.id) === categoryId)) {
    return { error: 'Select a valid food category.' };
  }
  if (!Number.isInteger(preparationTime) || preparationTime <= 0) return { error: 'Preparation time must be a positive whole number.' };
  if (!Number.isInteger(stock) || stock < 0) return { error: 'Stock must be a non-negative whole number.' };
  if (portionAmount !== null && (!Number.isFinite(portionAmount) || portionAmount <= 0)) {
    return { error: 'Serving size must be greater than zero, or left blank.' };
  }
  if (!['g', 'kg'].includes(portionUnit)) return { error: 'Serving size unit must be grams or kilograms.' };

  return {
    value: {
      ...existing,
      name,
      description: String(payload.description ?? existing.description ?? '').trim(),
      categoryId,
      price,
      discountPrice,
      image: String(payload.image ?? existing.image ?? '').trim(),
      veg: parseBoolean(payload.veg, existing.veg ?? true),
      ingredients: typeof (payload.ingredients ?? existing.ingredients) === 'string'
        ? String(payload.ingredients ?? existing.ingredients).split(',').map((item) => item.trim()).filter(Boolean)
        : (payload.ingredients ?? existing.ingredients ?? []),
      preparationTime,
      portionAmount,
      portionUnit,
      availability: parseBoolean(payload.availability === undefined ? undefined : payload.availability === 'available', existing.availability === 'available')
        ? 'available'
        : 'out_of_stock',
      featured: parseBoolean(payload.featured, existing.featured ?? false),
      stock,
      customizations: existing.customizations || []
    }
  };
}

function parseServicePayload(payload, existing = {}) {
  const name = String(payload.name ?? existing.name ?? '').trim();
  const description = String(payload.description ?? existing.description ?? '').trim();
  const startingPrice = Number(payload.startingPrice ?? existing.startingPrice ?? 0);
  const featuresValue = payload.features ?? existing.features ?? [];
  const features = Array.isArray(featuresValue)
    ? featuresValue.map((feature) => String(feature).trim()).filter(Boolean)
    : String(featuresValue).split(',').map((feature) => feature.trim()).filter(Boolean);

  if (!name) return { error: 'Catering service name is required.' };
  if (!description) return { error: 'Catering service description is required.' };
  if (!Number.isFinite(startingPrice) || startingPrice < 0) return { error: 'Starting price must be a non-negative amount.' };

  return {
    value: {
      ...existing,
      name,
      description,
      startingPrice,
      features,
      image: String(payload.image ?? existing.image ?? '').trim(),
      status: parseBoolean(payload.active, existing.status === 'active') ? 'active' : 'inactive'
    }
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Cloud Kitchen API is running.' });
});

app.get('/api/featured-combo', (req, res) => {
  res.json(state.featuredCombo);
});

app.get('/api/admin/featured-combo', authMiddleware, adminOnly, (req, res) => {
  res.json(state.featuredCombo);
});

app.patch('/api/admin/featured-combo', authMiddleware, adminOnly, (req, res) => {
  const payload = req.body || {};
  const label = String(payload.label ?? state.featuredCombo.label).trim();
  const name = String(payload.name ?? state.featuredCombo.name).trim();
  const description = String(payload.description ?? state.featuredCombo.description).trim();
  const price = Number(payload.price ?? state.featuredCombo.price);

  if (!label || !name || !description) {
    return res.status(400).json({ message: 'Combo label, name, and description are required.' });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: 'Combo price must be a non-negative amount.' });
  }
  if (label.length > 80 || name.length > 120 || description.length > 300) {
    return res.status(400).json({ message: 'Combo text exceeds the allowed length.' });
  }

  Object.assign(state.featuredCombo, { label, name, description, price });
  res.json(state.featuredCombo);
});

app.get('/api/payment-details', (req, res) => {
  res.json(state.paymentSettings);
});

app.get('/api/admin/payment-details', authMiddleware, adminOnly, (req, res) => {
  res.json(state.paymentSettings);
});

app.patch('/api/admin/payment-details', authMiddleware, adminOnly, (req, res) => {
  const payload = req.body || {};
  const cashOnDeliveryEnabled = parseBoolean(payload.cashOnDeliveryEnabled, state.paymentSettings.cashOnDeliveryEnabled);
  const onlinePaymentEnabled = parseBoolean(payload.onlinePaymentEnabled, state.paymentSettings.onlinePaymentEnabled);
  if (!cashOnDeliveryEnabled && !onlinePaymentEnabled) {
    return res.status(400).json({ message: 'Enable at least one checkout payment method.' });
  }

  const nextSettings = { cashOnDeliveryEnabled, onlinePaymentEnabled };
  nextSettings.upiId = String(payload.upiId ?? state.paymentSettings.upiId ?? '').trim();
  if (nextSettings.upiId.length > 120) return res.status(400).json({ message: 'UPI ID must be 120 characters or fewer.' });

  Object.assign(state.paymentSettings, nextSettings);
  res.json(state.paymentSettings);
});

app.post('/api/admin/payment-details/qr-code', authMiddleware, adminOnly, handleImageUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a QR code image to upload.' });
  if (!validateImageBuffer(req.file)) return res.status(400).json({ message: 'The uploaded file content does not match a supported image.' });
  try {
    const previousImage = state.paymentSettings.qrCodeImage;
    state.paymentSettings.qrCodeImage = await storeImage(req.file, 'payment');
    deleteImageAfterSave(res, previousImage, 'Previous payment QR image');
  } catch (error) {
    console.error('Payment QR code image could not be saved.', error);
    return res.status(500).json({ message: 'QR code image could not be saved.' });
  }

  res.json(state.paymentSettings);
});

app.post('/api/admin/featured-combo/image', authMiddleware, adminOnly, handleImageUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose an image to upload.' });
  if (!validateImageBuffer(req.file)) return res.status(400).json({ message: 'The uploaded file content does not match a supported image.' });
  try {
    const previousImage = state.featuredCombo.image;
    state.featuredCombo.image = await storeImage(req.file, 'featured-combo');
    deleteImageAfterSave(res, previousImage, 'Previous featured combo image');
  } catch (error) {
    console.error('Featured combo image could not be saved.', error);
    return res.status(500).json({ message: 'Featured combo image could not be saved.' });
  }

  res.json(state.featuredCombo);
});

app.delete('/api/admin/featured-combo/image', authMiddleware, adminOnly, (req, res) => {
  const previousImage = state.featuredCombo.image;
  state.featuredCombo.image = '';
  deleteImageAfterSave(res, previousImage, 'Featured combo image');
  res.json(state.featuredCombo);
});

app.delete('/api/admin/payment-details/qr-code', authMiddleware, adminOnly, (req, res) => {
  const imagePath = state.paymentSettings.qrCodeImage;
  state.paymentSettings.qrCodeImage = '';
  deleteImageAfterSave(res, imagePath, 'Previous payment QR image');
  res.json(state.paymentSettings);
});

app.get('/api/categories', (req, res) => {
  res.json(state.categories.filter((category) => category.status === 'active'));
});

app.get('/api/food', (req, res) => {
  const items = state.foodItems.map((item) => ({
    ...item,
    image: item.image ? item.image : state.foodItems.find((candidate) => Number(candidate.categoryId) === Number(item.categoryId) && candidate.id !== item.id)?.image || '',
    categoryName: state.categories.find((cat) => Number(cat.id) === Number(item.categoryId))?.name || 'General'
  }));
  res.json(items);
});

app.get('/api/admin/categories', authMiddleware, adminOnly, (req, res) => {
  res.json(state.categories);
});

app.get('/api/admin/food', authMiddleware, adminOnly, (req, res) => {
  res.json(state.foodItems.map((item) => ({
    ...item,
    categoryName: state.categories.find((category) => Number(category.id) === Number(item.categoryId))?.name || 'General'
  })));
});

app.post('/api/admin/categories', authMiddleware, adminOnly, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Category name is required.' });
  if (state.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ message: 'A category with this name already exists.' });
  }

  const category = {
    id: getNextId(state.categories),
    name,
    image: String(req.body.image || '').trim(),
    status: parseBoolean(req.body.active, true) ? 'active' : 'inactive',
    featured: parseBoolean(req.body.featured, false)
  };
  state.categories.push(category);
  res.status(201).json(category);
});

app.patch('/api/admin/categories/:id', authMiddleware, adminOnly, (req, res) => {
  const category = state.categories.find((item) => Number(item.id) === Number(req.params.id));
  if (!category) return res.status(404).json({ message: 'Category not found.' });

  const name = String(req.body.name ?? category.name).trim();
  if (!name) return res.status(400).json({ message: 'Category name is required.' });
  if (state.categories.some((item) => Number(item.id) !== Number(category.id) && item.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ message: 'A category with this name already exists.' });
  }

  category.name = name;
  if (Object.prototype.hasOwnProperty.call(req.body, 'image')) category.image = String(req.body.image || '').trim();
  if (Object.prototype.hasOwnProperty.call(req.body, 'active')) category.status = parseBoolean(req.body.active) ? 'active' : 'inactive';
  if (Object.prototype.hasOwnProperty.call(req.body, 'featured')) category.featured = parseBoolean(req.body.featured);
  res.json(category);
});

app.delete('/api/admin/categories/:id', authMiddleware, adminOnly, (req, res) => {
  const categoryId = Number(req.params.id);
  const categoryIndex = state.categories.findIndex((item) => Number(item.id) === categoryId);
  if (categoryIndex < 0) return res.status(404).json({ message: 'Category not found.' });
  if (state.foodItems.some((item) => Number(item.categoryId) === categoryId)) {
    return res.status(409).json({ message: 'Move or delete this category’s food items before deleting the category.' });
  }

  state.categories.splice(categoryIndex, 1);
  res.json({ id: categoryId, deleted: true });
});

app.post('/api/admin/food', authMiddleware, adminOnly, (req, res) => {
  const parsed = parseFoodPayload(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const food = {
    id: getNextId(state.foodItems),
    ...parsed.value,
    rating: 0
  };
  state.foodItems.push(food);
  res.status(201).json({
    ...food,
    categoryName: state.categories.find((category) => Number(category.id) === Number(food.categoryId))?.name || 'General'
  });
});

app.patch('/api/admin/food/:id', authMiddleware, adminOnly, (req, res) => {
  const food = state.foodItems.find((item) => Number(item.id) === Number(req.params.id));
  if (!food) {
    return res.status(404).json({ message: 'Food item not found.' });
  }

  const parsed = parseFoodPayload(req.body, food);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  Object.assign(food, parsed.value);
  res.json(food);
});

app.delete('/api/admin/food/:id', authMiddleware, adminOnly, (req, res) => {
  const foodIndex = state.foodItems.findIndex((item) => Number(item.id) === Number(req.params.id));
  if (foodIndex < 0) return res.status(404).json({ message: 'Food item not found.' });

  const [food] = state.foodItems.splice(foodIndex, 1);
  res.json({ id: food.id, deleted: true });
});

async function handleImageUpload(req, res, next) {
  imageUpload.single('image')(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || 'Image upload failed.' });
    next();
  });
}

async function saveCatalogImage(req, res, collectionName, collection, id) {
  const record = collection.find((item) => Number(item.id) === Number(id));
  if (!record) return res.status(404).json({ message: `${collectionName} not found.` });
  if (!req.file) return res.status(400).json({ message: 'Choose an image to upload.' });

  if (!validateImageBuffer(req.file)) return res.status(400).json({ message: 'The uploaded file content does not match a supported image.' });
  try {
    const previousImage = record.image;
    record.image = await storeImage(req.file, collectionName);
    deleteImageAfterSave(res, previousImage, `Previous ${collectionName} image`);
  } catch (error) {
    console.error(`Catalog ${collectionName} image could not be saved.`, error);
    return res.status(500).json({ message: 'Image could not be saved.' });
  }

  res.json(record);
}

app.post('/api/admin/food/:id/image', authMiddleware, adminOnly, handleImageUpload, (req, res) => (
  saveCatalogImage(req, res, 'foods', state.foodItems, req.params.id)
));

app.post('/api/admin/categories/:id/image', authMiddleware, adminOnly, handleImageUpload, (req, res) => (
  saveCatalogImage(req, res, 'categories', state.categories, req.params.id)
));

app.get('/api/catering-services', (req, res) => {
  res.json(state.services
    .filter((service) => service.status === 'active')
    .map(({ startingPrice, ...service }) => service));
});

app.get('/api/admin/catering-services', authMiddleware, adminOnly, (req, res) => {
  res.json(state.services);
});

app.post('/api/admin/catering-services', authMiddleware, adminOnly, (req, res) => {
  const parsed = parseServicePayload(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  if (state.services.some((service) => service.name.toLowerCase() === parsed.value.name.toLowerCase())) {
    return res.status(409).json({ message: 'A catering service with this name already exists.' });
  }

  const service = { id: getNextId(state.services), ...parsed.value };
  state.services.push(service);
  res.status(201).json(service);
});

app.patch('/api/admin/catering-services/:id', authMiddleware, adminOnly, (req, res) => {
  const service = state.services.find((item) => Number(item.id) === Number(req.params.id));
  if (!service) return res.status(404).json({ message: 'Catering service not found.' });
  const parsed = parseServicePayload(req.body, service);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  if (state.services.some((item) => Number(item.id) !== Number(service.id) && item.name.toLowerCase() === parsed.value.name.toLowerCase())) {
    return res.status(409).json({ message: 'A catering service with this name already exists.' });
  }

  Object.assign(service, parsed.value);
  res.json(service);
});

app.delete('/api/admin/catering-services/:id', authMiddleware, adminOnly, (req, res) => {
  const serviceIndex = state.services.findIndex((item) => Number(item.id) === Number(req.params.id));
  if (serviceIndex < 0) return res.status(404).json({ message: 'Catering service not found.' });
  const [service] = state.services.splice(serviceIndex, 1);
  res.json({ id: service.id, deleted: true });
});

app.post('/api/admin/catering-services/:id/image', authMiddleware, adminOnly, handleImageUpload, (req, res) => (
  saveCatalogImage(req, res, 'services', state.services, req.params.id)
));

app.get('/api/coupons', (req, res) => {
  res.json(state.coupons);
});

app.post('/api/coupons/apply', (req, res) => {
  const { code, subtotal } = req.body || {};
  if (!code || subtotal === undefined) {
    return res.status(400).json({ message: 'Coupon code and subtotal are required.' });
  }

  const discount = applyCoupon(code, Number(subtotal));
  res.json({ discount, code, valid: discount > 0 });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, address } = req.body || {};

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'Name, email, phone and password are required.' });
  }

  if (getUserByEmail(email)) {
    return res.status(409).json({ message: 'An account already exists with this email.' });
  }

  const user = {
    id: getNextId(state.users),
    name,
    email,
    phone,
    passwordHash: bcrypt.hashSync(password, 10),
    address: address || '',
    role: 'customer',
    status: 'active',
    createdAt: new Date().toISOString()
  };

  state.users.push(user);

  res.status(201).json({
    token: generateToken(user),
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  res.json({ token: generateToken(user), user: sanitizeUser(user) });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  const admin = getUserByEmail(email);

  if (!admin || admin.role !== 'admin' || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ message: 'Admin login failed.' });
  }

  res.json({ token: generateToken(admin), user: sanitizeUser(admin) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/my-orders', authMiddleware, (req, res) => {
  const orders = state.orders.filter((order) => Number(order.userId) === Number(req.user.id));
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const order = state.orders.find((item) => Number(item.id) === Number(req.params.id));
  if (!order) {
    return res.status(404).json({ message: 'Order not found.' });
  }
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const {
    items = [],
    customerName,
    phone,
    email,
    address,
    landmark,
    pincode,
    instructions,
    paymentMethod,
    couponCode,
    userId
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Cart is empty.' });
  }
  const selectedPaymentMethod = paymentMethod || 'cod';
  if (!['cod', 'online'].includes(selectedPaymentMethod)
    || (selectedPaymentMethod === 'cod' && !state.paymentSettings.cashOnDeliveryEnabled)
    || (selectedPaymentMethod === 'online' && !state.paymentSettings.onlinePaymentEnabled)) {
    return res.status(400).json({ message: 'Select an available payment method.' });
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const discount = couponCode ? applyCoupon(couponCode, subtotal) : 0;
  const deliveryFee = subtotal > 0 ? 35 : 0;
  const tax = (subtotal - discount) * 0.05;
  const total = subtotal - discount + deliveryFee + tax;

  const order = {
    id: getNextId(state.orders),
    userId: userId || null,
    customerName: customerName || 'Customer',
    phone: phone || '',
    email: email || '',
    address: address || '',
    landmark: landmark || '',
    pincode: pincode || '',
    instructions: instructions || '',
    subtotal: Number(subtotal).toFixed(2),
    discount: Number(discount).toFixed(2),
    deliveryFee: Number(deliveryFee).toFixed(2),
    tax: Number(tax).toFixed(2),
    total: Number(total).toFixed(2),
    paymentMethod: selectedPaymentMethod,
    paymentStatus: 'pending',
    status: 'Pending',
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity || 1,
      unitPrice: item.price,
      customizations: item.customizations || [],
      totalPrice: Number(item.price) * Number(item.quantity || 1)
    })),
    createdAt: new Date().toISOString()
  };

  state.orders.push(order);

  if (order.userId) {
    state.notifications.push({
      id: getNextId(state.notifications),
      userId: order.userId,
      type: 'order_confirmation',
      title: 'Order confirmed',
      message: `Your order #${order.id} has been placed successfully.`,
      isRead: false,
      createdAt: new Date().toISOString()
    });
  }

  res.status(201).json(order);
});

app.get('/api/admin/summary', authMiddleware, adminOnly, (req, res) => {
  const totalOrders = state.orders.length;
  const today = new Date();
  const todaysOrders = state.orders.filter((order) => {
    const created = new Date(order.createdAt);
    return created.toDateString() === today.toDateString();
  }).length;
  const pendingOrders = state.orders.filter((order) => order.status === 'Pending').length;
  const completedOrders = state.orders.filter((order) => order.status === 'Delivered').length;
  const totalRevenue = state.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const totalCustomers = state.users.filter((user) => user.role === 'customer').length;
  const lowStock = state.foodItems.filter((item) => item.availability === 'out_of_stock' || Number(item.stock || 0) <= 5).length;

  res.json({
    totalOrders,
    todaysOrders,
    pendingOrders,
    completedOrders,
    totalRevenue,
    totalCustomers,
    partyOrders: state.partyOrders.length,
    cateringRequests: state.cateringRequests.length,
    lowStock
  });
});

app.get('/api/admin/orders', authMiddleware, adminOnly, (req, res) => {
  res.json(state.orders.slice().reverse());
});

app.patch('/api/admin/orders/:id/status', authMiddleware, adminOnly, (req, res) => {
  const { status } = req.body || {};
  const order = state.orders.find((item) => Number(item.id) === Number(req.params.id));

  if (!order) {
    return res.status(404).json({ message: 'Order not found.' });
  }

  order.status = status || order.status;
  res.json(order);
});

app.post('/api/party-orders', (req, res) => {
  const payload = req.body || {};

  if (!payload.customerName || !payload.phone || !payload.email) {
    return res.status(400).json({ message: 'Customer name, phone and email are required.' });
  }

  const request = {
    id: getNextId(state.partyOrders),
    ...payload,
    status: 'New',
    createdAt: new Date().toISOString()
  };

  state.partyOrders.push(request);

  state.notifications.push({
    id: getNextId(state.notifications),
    type: 'party_order',
    title: 'Party order request received',
    message: `A new party order request has been submitted by ${payload.customerName}.`,
    isRead: false,
    createdAt: new Date().toISOString()
  });

  res.status(201).json(request);
});

app.get('/api/admin/party-orders', authMiddleware, adminOnly, (req, res) => {
  res.json(state.partyOrders.slice().reverse());
});

app.patch('/api/admin/party-orders/:id/status', authMiddleware, adminOnly, (req, res) => {
  const { status } = req.body || {};
  const request = state.partyOrders.find((item) => Number(item.id) === Number(req.params.id));

  if (!request) {
    return res.status(404).json({ message: 'Party order request not found.' });
  }

  request.status = status || request.status;
  res.json(request);
});

app.post('/api/catering-requests', (req, res) => {
  const payload = req.body || {};

  if (!payload.customerName || !payload.phone || !payload.email) {
    return res.status(400).json({ message: 'Customer name, phone and email are required.' });
  }

  const request = {
    id: getNextId(state.cateringRequests),
    ...payload,
    status: 'New',
    createdAt: new Date().toISOString()
  };

  state.cateringRequests.push(request);

  state.notifications.push({
    id: getNextId(state.notifications),
    type: 'catering_request',
    title: 'Catering request received',
    message: `A new catering request has been submitted by ${payload.customerName}.`,
    isRead: false,
    createdAt: new Date().toISOString()
  });

  res.status(201).json(request);
});

app.get('/api/admin/catering-requests', authMiddleware, adminOnly, (req, res) => {
  res.json(state.cateringRequests.slice().reverse());
});

app.patch('/api/admin/catering-requests/:id/status', authMiddleware, adminOnly, (req, res) => {
  const { status } = req.body || {};
  const request = state.cateringRequests.find((item) => Number(item.id) === Number(req.params.id));

  if (!request) {
    return res.status(404).json({ message: 'Catering request not found.' });
  }

  request.status = status || request.status;
  res.json(request);
});

app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Name, email and message are required.' });
  }

  const msg = {
    id: getNextId(state.contactMessages),
    name,
    email,
    phone: phone || '',
    subject: subject || 'General enquiry',
    message,
    createdAt: new Date().toISOString()
  };

  state.contactMessages.push(msg);
  res.status(201).json(msg);
});

app.get('/api/admin/messages', authMiddleware, adminOnly, (req, res) => {
  res.json(state.contactMessages.slice().reverse());
});

app.get('/api/admin/customers', authMiddleware, adminOnly, (req, res) => {
  const customerRows = state.users
    .filter((user) => user.role === 'customer')
    .map((user) => ({
      ...sanitizeUser(user),
      orderCount: state.orders.filter((order) => Number(order.userId) === Number(user.id)).length,
      totalSpent: state.orders
        .filter((order) => Number(order.userId) === Number(user.id))
        .reduce((sum, order) => sum + Number(order.total || 0), 0)
    }));

  res.json(customerRows);
});

app.get('/api/admin/notifications', authMiddleware, adminOnly, (req, res) => {
  res.json(state.notifications.slice().reverse().slice(0, 20));
});

initializePersistence(state)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Cloud Kitchen server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Persistent storage could not be initialized; the API was not started.', error);
    process.exitCode = 1;
  });
