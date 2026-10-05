const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const localStatePath = path.resolve(
  process.env.DATA_FILE_PATH || path.join(__dirname, 'data', 'state.json')
);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'cloud-kitchen-assets';
const hasPartialSupabaseConfiguration = Boolean(supabaseUrl) !== Boolean(supabaseServiceKey);
let supabase;

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

function getPersistenceMode() {
  return supabase ? 'supabase-postgres' : 'local-json-development';
}

async function loadSupabaseState(state) {
  const { data, error } = await supabase.rpc('read_application_state');
  if (error) throw new Error(`Could not load application state from Supabase: ${error.message}`);
  if (!data) return false;

  for (const key of Object.keys(state)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) state[key] = data[key];
  }
  return true;
}

async function persistSupabaseState(state) {
  const { error } = await supabase.rpc('persist_application_state', { p_state: snapshot(state) });
  if (error) throw new Error(`Could not save application state in Supabase: ${error.message}`);
}

async function initializePersistence(state) {
  if (hasPartialSupabaseConfiguration) {
    throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or unset both for local development.');
  }
  if (!supabaseUrl && (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true')) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production; refusing to start with temporary storage.');
  }
  if ((process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') && !process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is required in production.');
  }

  if (supabaseUrl) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const hasSavedState = await loadSupabaseState(state);
    if (!hasSavedState) await persistSupabaseState(state);
    console.log('Persistent storage: Supabase PostgreSQL.');
    console.log(`Persistent image storage: Supabase Storage bucket "${storageBucket}".`);
    return;
  }

  if (fs.existsSync(localStatePath)) {
    const saved = JSON.parse(await fs.promises.readFile(localStatePath, 'utf8'));
    Object.assign(state, saved);
  } else {
    await saveState(state);
  }
  console.warn('Using local JSON development storage. This mode is not suitable for production.');
}

async function refreshState(state) {
  if (supabase) await loadSupabaseState(state);
}

async function saveState(state) {
  if (supabase) {
    await persistSupabaseState(state);
    return;
  }

  const data = snapshot(state);
  await fs.promises.mkdir(path.dirname(localStatePath), { recursive: true });
  const temporaryPath = `${localStatePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), { flag: 'w' });
  await fs.promises.rename(temporaryPath, localStatePath);
}

async function storeImage(file, collectionName) {
  const extension = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  }[file.mimetype];
  if (!extension) throw new Error('Unsupported image type.');

  const filePath = `${collectionName}/${randomUUID()}${extension}`;
  if (supabase) {
    const { error } = await supabase.storage.from(storageBucket).upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
    if (error) throw new Error(`Could not upload image to Supabase Storage: ${error.message}`);
    const { data } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
    return data.publicUrl;
  }

  const directory = path.resolve(__dirname, '..', 'uploads', collectionName);
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(path.join(directory, path.basename(filePath)), file.buffer, { flag: 'wx' });
  return `/uploads/${filePath}`;
}

async function deleteImage(imageUrl) {
  if (!imageUrl) return;

  if (supabase) {
    const publicPrefix = `/storage/v1/object/public/${storageBucket}/`;
    const servicePrefix = `/storage/v1/object/${storageBucket}/`;
    let pathname;
    try {
      pathname = new URL(imageUrl).pathname;
    } catch {
      return;
    }
    const prefix = pathname.includes(publicPrefix) ? publicPrefix : servicePrefix;
    if (!pathname.includes(prefix)) return;
    const filePath = decodeURIComponent(pathname.slice(pathname.indexOf(prefix) + prefix.length));
    const { error } = await supabase.storage.from(storageBucket).remove([filePath]);
    if (error) throw new Error(`Could not remove the replaced image from Supabase Storage: ${error.message}`);
    return;
  }

  const localImage = imageUrl.match(/^\/uploads\/(foods|categories|services|payment|featured-combo)\/([^/]+)$/);
  if (!localImage) return;
  const filePath = path.resolve(__dirname, '..', 'uploads', localImage[1], localImage[2]);
  await fs.promises.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

module.exports = {
  deleteImage,
  getPersistenceMode,
  initializePersistence,
  refreshState,
  saveState,
  storeImage
};
