require('dotenv').config();

const readline = require('readline');
const legacyApiBase = (process.env.LEGACY_API_BASE_URL || 'https://ascloudkitchen.onrender.com/api').replace(/\/+$/, '');
const legacyApiOrigin = new URL(legacyApiBase).origin;
const uploadedImages = new Set();

function ask(question) {
  return new Promise((resolve) => {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    terminal.question(question, (answer) => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  if (!process.stdin.isTTY) {
    throw new Error('Run this migration from an interactive terminal so the admin password can be entered privately.');
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let answer = '';
    let settled = false;

    readline.emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    process.stdout.write(question);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      input.removeListener('keypress', onKeypress);
      input.setRawMode(wasRaw || false);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(answer);
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Migration cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        answer = answer.slice(0, -1);
        return;
      }
      if (!key.ctrl && !key.meta && character) answer += character;
    };

    input.on('keypress', onKeypress);
  });
}

async function requestJson(endpoint, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${legacyApiBase}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Legacy API request ${endpoint} failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function moveLocalImage(imageUrl, collectionName, storeImage) {
  if (!imageUrl) return imageUrl;

  let source;
  try {
    source = new URL(imageUrl, legacyApiOrigin);
  } catch {
    return imageUrl;
  }
  if (source.origin !== legacyApiOrigin || !source.pathname.startsWith('/uploads/')) return imageUrl;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not download an existing ${collectionName} image (${response.status}): ${source.pathname}`);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new Error(`Existing ${collectionName} image has an unsupported content type: ${contentType || 'unknown'}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error(`Existing ${collectionName} image exceeds the 5 MB upload limit.`);
  }
  const storedUrl = await storeImage({ mimetype: contentType, buffer }, collectionName);
  uploadedImages.add(storedUrl);
  return storedUrl;
}

async function migrateImages(collection, collectionName, storeImage) {
  for (const item of collection) {
    item.image = await moveLocalImage(item.image, collectionName, storeImage);
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local .env file before running this migration.');
  }

  const email = await ask(`Current live admin email [${process.env.ADMIN_EMAIL || 'ascloudkitchenofficial@gmail.com'}]: `)
    || process.env.ADMIN_EMAIL
    || 'ascloudkitchenofficial@gmail.com';
  const password = await askHidden('Current live admin password (input is hidden): ');
  if (!password) throw new Error('The admin password cannot be empty.');

  const login = await requestJson('/admin/login', {
    method: 'POST',
    body: { email, password }
  });
  if (!login.token || login.user?.role !== 'admin') throw new Error('The legacy API did not return an authenticated admin session.');

  const token = login.token;
  const [
    categories,
    foodItems,
    services,
    paymentSettings,
    featuredCombo,
    coupons,
    orders,
    partyOrders,
    cateringRequests,
    contactMessages,
    notifications
  ] = await Promise.all([
    requestJson('/admin/categories', { token }),
    requestJson('/admin/food', { token }),
    requestJson('/admin/catering-services', { token }),
    requestJson('/admin/payment-details', { token }),
    requestJson('/admin/featured-combo', { token }),
    requestJson('/coupons'),
    requestJson('/admin/orders', { token }),
    requestJson('/admin/party-orders', { token }),
    requestJson('/admin/catering-requests', { token }),
    requestJson('/admin/messages', { token }),
    requestJson('/admin/notifications', { token })
  ]);

  process.env.ADMIN_EMAIL = login.user.email;
  process.env.ADMIN_PASSWORD = password;
  const { state, seedData } = require('../backend/db');
  seedData();

  const persistence = require('../backend/persistence');
  await persistence.initializePersistence(state);

  const existingAdmin = state.users.find((user) => user.role === 'admin');
  const adminRecord = existingAdmin || {};
  if (existingAdmin) {
    Object.assign(adminRecord, login.user, { id: existingAdmin.id });
  } else {
    Object.assign(adminRecord, login.user);
  }
  Object.assign(adminRecord, {
    role: 'admin',
    status: 'active',
    passwordHash: require('bcryptjs').hashSync(password, 10)
  });
  if (!existingAdmin) state.users.push(adminRecord);

  state.categories = categories;
  state.foodItems = foodItems;
  state.services = services;
  state.paymentSettings = paymentSettings;
  state.featuredCombo = featuredCombo;
  state.coupons = coupons;
  state.orders = orders.slice().reverse();
  state.partyOrders = partyOrders.slice().reverse();
  state.cateringRequests = cateringRequests.slice().reverse();
  state.contactMessages = contactMessages.slice().reverse();
  state.notifications = notifications.slice().reverse();

  try {
    await migrateImages(state.categories, 'categories', persistence.storeImage);
    await migrateImages(state.foodItems, 'foods', persistence.storeImage);
    await migrateImages(state.services, 'services', persistence.storeImage);
    state.paymentSettings.qrCodeImage = await moveLocalImage(
      state.paymentSettings.qrCodeImage,
      'payment',
      persistence.storeImage
    );
    state.featuredCombo.image = await moveLocalImage(
      state.featuredCombo.image,
      'featured-combo',
      persistence.storeImage
    );
    await persistence.saveState(state);
  } catch (error) {
    await Promise.all([...uploadedImages].map((imageUrl) => persistence.deleteImage(imageUrl).catch((cleanupError) => {
      console.error('An uploaded image could not be removed after migration failed.', cleanupError);
    })));
    throw error;
  }

  console.log('Live admin data was saved to Supabase.');
  console.log(`Storage mode: ${persistence.getPersistenceMode()}`);
  console.log(`Migrated ${categories.length} categories, ${foodItems.length} foods, and ${services.length} catering services.`);
  console.log(`Also migrated ${orders.length} orders, ${partyOrders.length} party requests, ${cateringRequests.length} catering requests, and ${contactMessages.length} messages.`);
  console.log('After this completes, deploy the backend and verify /api/health reports storage "supabase-postgres".');
}

main().catch((error) => {
  console.error(`Live data migration failed: ${error.message}`);
  process.exitCode = 1;
});
