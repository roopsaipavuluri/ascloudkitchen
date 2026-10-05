require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { toMenuRecord } = require('../backend/persistence');

async function main() {
  const statePath = path.resolve(
    process.env.MENU_STATE_FILE
      || process.env.DATA_FILE_PATH
      || path.join(__dirname, '..', 'backend', 'data', 'state.json')
  );
  if (!fs.existsSync(statePath)) {
    throw new Error(`State file not found: ${statePath}. Set MENU_STATE_FILE to the existing state.json path.`);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local .env file before importing menu data.');
  }

  const state = JSON.parse(await fs.promises.readFile(statePath, 'utf8'));
  if (!Array.isArray(state.foodItems)) {
    throw new Error('The state file must contain a foodItems array.');
  }
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const seenCategoryIds = new Set();
  const categoryRows = categories.map((category) => {
    const id = Number(category.id);
    if (!Number.isSafeInteger(id) || id < 1 || seenCategoryIds.has(id)) {
      throw new Error(`Invalid or duplicate category id in state file: ${category.id}`);
    }
    seenCategoryIds.add(id);
    return {
      id,
      name: category.name,
      image_url: category.image || null,
      status: category.status || 'active',
      featured: category.featured === true,
      details: category
    };
  });
  const seenIds = new Set();
  const rows = state.foodItems.map((item) => {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id < 1 || seenIds.has(id)) {
      throw new Error(`Invalid or duplicate menu item id in state file: ${item.id}`);
    }
    seenIds.add(id);
    const categoryName = categories.find((category) => Number(category.id) === Number(item.categoryId))?.name;
    return toMenuRecord({ ...item, id }, categoryName);
  });

  if (rows.length === 0 && categoryRows.length === 0) {
    console.log('No menu items or categories found; nothing was imported.');
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  if (categoryRows.length > 0) {
    const { error } = await supabase
      .from('categories')
      .upsert(categoryRows, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Could not import menu categories into Supabase: ${error.message}`);
  }
  const { data, error } = await supabase
    .from('menu_items')
    .upsert(rows, { onConflict: 'app_id', ignoreDuplicates: true })
    .select('app_id');
  if (error) throw new Error(`Could not import menu items into Supabase: ${error.message}`);

  console.log(`Processed ${categoryRows.length} categories and ${rows.length} menu items from the local state file.`);
  console.log(`Inserted ${data.length} new rows into public.menu_items; existing matching IDs were left unchanged.`);
  console.log('The category import is also idempotent, so rerunning this import will not create duplicate rows.');
}

main().catch((error) => {
  console.error(`Menu data import failed: ${error.message}`);
  process.exitCode = 1;
});
