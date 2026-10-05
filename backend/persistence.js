const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { MongoClient } = require('mongodb');

const localStatePath = path.resolve(
  process.env.DATA_FILE_PATH || path.join(__dirname, 'data', 'state.json')
);
const mongoUri = process.env.MONGODB_URI;
let mongoClient;
let mongoDatabase;

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

async function initializePersistence(state) {
  if (mongoUri) {
    mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    mongoDatabase = mongoClient.db(process.env.MONGODB_DATABASE || 'as_cloud_kitchen');

    const saved = await mongoDatabase.collection('app_state').find({}).toArray();
    if (saved.length) {
      for (const key of Object.keys(state)) {
        const records = saved.filter((record) => record.key === key);
        if (Array.isArray(state[key])) {
          state[key] = records.sort((first, second) => first.index - second.index).map((record) => record.value);
        } else if (records.length) {
          state[key] = records[0].value;
        }
      }
      console.log('Loaded Cloud Kitchen state from MongoDB.');
    } else {
      await saveState(state);
      console.log('Initialized MongoDB with the Cloud Kitchen seed data.');
    }
    console.log('Persistent storage: MongoDB Atlas.');
    return;
  }

  if (fs.existsSync(localStatePath)) {
    const saved = JSON.parse(await fs.promises.readFile(localStatePath, 'utf8'));
    Object.assign(state, saved);
    console.log(`Loaded Cloud Kitchen state from ${localStatePath}.`);
  } else {
    await saveState(state);
    console.warn('MONGODB_URI is unset; using local JSON persistence. This is not durable on Render.');
  }
}

async function saveState(state) {
  const data = snapshot(state);
  if (mongoDatabase) {
    const collection = mongoDatabase.collection('app_state');
    const records = Object.entries(data).flatMap(([key, value]) => (
      Array.isArray(value)
        ? value.map((item, index) => ({ _id: `${key}:${index}`, key, index, value: item }))
        : [{ _id: `${key}:singleton`, key, index: 0, value }]
    ));
    if (records.length) {
      await collection.bulkWrite(records.map((record) => ({
        replaceOne: {
          filter: { _id: record._id },
          replacement: { ...record, savedAt: new Date() },
          upsert: true
        }
      })));
    }
    await collection.deleteMany({ _id: { $nin: records.map((record) => record._id) } });
    return;
  }

  await fs.promises.mkdir(path.dirname(localStatePath), { recursive: true });
  const temporaryPath = `${localStatePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), { flag: 'w' });
  await fs.promises.rename(temporaryPath, localStatePath);
}

async function storeImage(file, collectionName) {
  const id = randomUUID();
  const extension = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  }[file.mimetype];
  if (!extension) throw new Error('Unsupported image type.');

  if (mongoDatabase) {
    await mongoDatabase.collection('uploaded_images').insertOne({
      _id: id,
      contentType: file.mimetype,
      data: file.buffer,
      createdAt: new Date()
    });
    return `/api/media/${id}`;
  }

  const directory = path.resolve(__dirname, '..', 'uploads', collectionName);
  await fs.promises.mkdir(directory, { recursive: true });
  const filename = `${id}${extension}`;
  await fs.promises.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' });
  return `/uploads/${collectionName}/${filename}`;
}

async function readImage(id) {
  if (!mongoDatabase) return null;
  return mongoDatabase.collection('uploaded_images').findOne({ _id: id });
}

async function deleteImage(imagePath) {
  if (!imagePath) return;

  const remoteImage = imagePath.match(/^\/api\/media\/([a-zA-Z0-9-]+)$/);
  if (remoteImage && mongoDatabase) {
    await mongoDatabase.collection('uploaded_images').deleteOne({ _id: remoteImage[1] });
    return;
  }

  const localImage = imagePath.match(/^\/uploads\/(foods|categories|services|payment|featured-combo)\/([^/]+)$/);
  if (!localImage) return;
  const filePath = path.resolve(__dirname, '..', 'uploads', localImage[1], localImage[2]);
  await fs.promises.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

module.exports = {
  deleteImage,
  initializePersistence,
  readImage,
  saveState,
  storeImage
};
