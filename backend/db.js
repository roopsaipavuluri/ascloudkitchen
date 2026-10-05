const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');

const state = {
  users: [],
  categories: [],
  foodItems: [],
  paymentSettings: {
    cashOnDeliveryEnabled: true,
    onlinePaymentEnabled: true,
    upiId: '',
    qrCodeImage: ''
  },
  services: [],
  orders: [],
  partyOrders: [],
  cateringRequests: [],
  contactMessages: [],
  coupons: [],
  notifications: []
};

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function seedData() {
  if (state.users.length > 0) return;

  const adminEmail = process.env.ADMIN_EMAIL || 'ascloudkitchenofficial@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url');
  const adminHash = hashPassword(adminPassword);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(`ADMIN_PASSWORD is unset. Generated a one-time admin password for this run: ${adminPassword}`);
  }
  state.users.push({
    id: 1,
    name: 'Admin User',
    email: adminEmail,
    phone: '9999999999',
    passwordHash: adminHash,
    address: 'Cloud Kitchen HQ',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString()
  });

  state.users.push({
    id: 2,
    name: 'Demo Customer',
    email: 'demo@cloudkitchen.com',
    phone: '9876543210',
    passwordHash: hashPassword('demo123'),
    address: '12 Main Road, Bengaluru',
    role: 'customer',
    status: 'active',
    createdAt: new Date().toISOString()
  });

  state.categories = [
    { id: 1, name: 'Starters', image: '', status: 'active', featured: true },
    { id: 2, name: 'Main Course', image: '', status: 'active', featured: true },
    { id: 3, name: 'Biryani', image: '', status: 'active', featured: true },
    { id: 4, name: 'Rice', image: '', status: 'active', featured: true },
    { id: 5, name: 'Noodles', image: '', status: 'active', featured: true },
    { id: 6, name: 'Pizza', image: '', status: 'active', featured: true },
    { id: 7, name: 'Burgers', image: '', status: 'active', featured: true },
    { id: 8, name: 'Snacks', image: '', status: 'active', featured: true },
    { id: 9, name: 'Desserts', image: '', status: 'active', featured: true },
    { id: 10, name: 'Beverages', image: '', status: 'active', featured: true }
  ];

  state.foodItems = [
    {
      id: 1,
      name: 'Paneer Tikka Bowl',
      description: 'Char-grilled paneer served with saffron rice and mint chutney.',
      categoryId: 1,
      price: 249,
      discountPrice: 219,
      image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Paneer', 'Bell pepper', 'Lemon', 'Rice', 'Mint'],
      preparationTime: 20,
      availability: 'available',
      featured: true,
      rating: 4.8,
      stock: 15,
      customizations: [
        { id: 1, name: 'Extra Paneer', price: 60 },
        { id: 2, name: 'Spicy Level', price: 20 }
      ]
    },
    {
      id: 2,
      name: 'Butter Chicken',
      description: 'Creamy tomato gravy with roasted chicken and buttery finish.',
      categoryId: 2,
      price: 329,
      discountPrice: 289,
      image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=80',
      veg: false,
      ingredients: ['Chicken', 'Tomato', 'Cream', 'Butter', 'Spices'],
      preparationTime: 25,
      availability: 'available',
      featured: true,
      rating: 4.9,
      stock: 10,
      customizations: [
        { id: 3, name: 'Extra Chicken', price: 90 },
        { id: 4, name: 'Bun Option', price: 30 }
      ]
    },
    {
      id: 3,
      name: 'Hyderabadi Dum Biryani',
      description: 'Long-grain basmati with saffron, herbs, and slow-cooked spices.',
      categoryId: 3,
      price: 399,
      discountPrice: 349,
      image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=80',
      veg: false,
      ingredients: ['Rice', 'Chicken', 'Onion', 'Yogurt', 'Herbs'],
      preparationTime: 30,
      portionAmount: 500,
      portionUnit: 'g',
      availability: 'available',
      featured: true,
      rating: 5,
      stock: 22,
      customizations: [
        { id: 5, name: 'Large Portion', price: 120 },
        { id: 6, name: 'Extra Chicken', price: 110 }
      ]
    },
    {
      id: 4,
      name: 'Veg Fried Rice',
      description: 'Wok-tossed rice with seasonal vegetables and Asian flavors.',
      categoryId: 4,
      price: 199,
      discountPrice: 169,
      image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Rice', 'Carrots', 'Bean sprouts', 'Soy sauce'],
      preparationTime: 18,
      availability: 'available',
      featured: false,
      rating: 4.5,
      stock: 18,
      customizations: [
        { id: 7, name: 'Egg Add-on', price: 35 },
        { id: 8, name: 'Extra Spice', price: 15 }
      ]
    },
    {
      id: 5,
      name: 'Veg Hakka Noodles',
      description: 'Classic noodles tossed with crispy vegetables and savory sauce.',
      categoryId: 5,
      price: 229,
      discountPrice: 199,
      image: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Noodles', 'Corn', 'Capsicum', 'Soy sauce'],
      preparationTime: 20,
      availability: 'available',
      featured: true,
      rating: 4.7,
      stock: 16,
      customizations: [
        { id: 9, name: 'Chili Garlic', price: 25 },
        { id: 10, name: 'Paneer Add-on', price: 60 }
      ]
    },
    {
      id: 6,
      name: 'Margherita Pizza',
      description: 'Stone-fired pizza layered with fresh mozzarella and basil.',
      categoryId: 6,
      price: 279,
      discountPrice: 249,
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Pizza base', 'Mozzarella', 'Tomato', 'Basil'],
      preparationTime: 22,
      availability: 'available',
      featured: true,
      rating: 4.8,
      stock: 20,
      customizations: [
        { id: 11, name: 'Extra Cheese', price: 70 },
        { id: 12, name: 'Large Size', price: 110 }
      ]
    },
    {
      id: 7,
      name: 'Crispy Veg Burger',
      description: 'Crunchy patty, fresh lettuce, and signature house sauce.',
      categoryId: 7,
      price: 180,
      discountPrice: 159,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Veg patty', 'Bun', 'Lettuce', 'Sauce'],
      preparationTime: 15,
      availability: 'available',
      featured: false,
      rating: 4.4,
      stock: 12,
      customizations: [
        { id: 13, name: 'Extra Cheese', price: 40 },
        { id: 14, name: 'Add Jalapenos', price: 25 }
      ]
    },
    {
      id: 8,
      name: 'Loaded Nachos',
      description: 'Crispy tortilla chips topped with cheese, beans, and salsa.',
      categoryId: 8,
      price: 220,
      discountPrice: 189,
      image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Nachos', 'Beans', 'Cheese', 'Salsa'],
      preparationTime: 12,
      availability: 'available',
      featured: false,
      rating: 4.6,
      stock: 11,
      customizations: [
        { id: 15, name: 'Extra Cheese', price: 50 },
        { id: 16, name: 'Guacamole', price: 45 }
      ]
    },
    {
      id: 9,
      name: 'Gulab Jamun',
      description: 'Soft, saffron-soaked dumplings with a signature syrup finish.',
      categoryId: 9,
      price: 120,
      discountPrice: 99,
      image: 'https://images.unsplash.com/photo-1630150808018-7f87d0a8e1d2?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Milk solids', 'Sugar syrup', 'Cardamom'],
      preparationTime: 10,
      availability: 'available',
      featured: false,
      rating: 4.9,
      stock: 30,
      customizations: [
        { id: 17, name: 'Vanilla Scoop', price: 40 },
        { id: 18, name: 'Extra Syrup', price: 15 }
      ]
    },
    {
      id: 10,
      name: 'Mango Lassi',
      description: 'Refreshing yogurt-based drink blended with mango and cardamom.',
      categoryId: 10,
      price: 150,
      discountPrice: 129,
      image: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=900&q=80',
      veg: true,
      ingredients: ['Yogurt', 'Mango', 'Cardamom', 'Milk'],
      preparationTime: 8,
      availability: 'available',
      featured: true,
      rating: 4.7,
      stock: 25,
      customizations: [
        { id: 19, name: 'Extra Mango', price: 30 },
        { id: 20, name: 'Low Sugar', price: 0 }
      ]
    }
  ];

  state.services = [
    {
      id: 1,
      name: 'Wedding Catering',
      description: 'Elegant menus and curated dining experiences for your wedding celebrations.',
      image: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80',
      startingPrice: 1200,
      features: ['Curated menu', 'Live counters', 'Staffing support'],
      status: 'active'
    },
    {
      id: 2,
      name: 'Birthday Catering',
      description: 'Fun, colorful, and crowd-favorite service for birthday celebrations.',
      image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=900&q=80',
      startingPrice: 800,
      features: ['Custom theme menu', 'Dessert bar', 'Fast service'],
      status: 'active'
    },
    {
      id: 3,
      name: 'Corporate Catering',
      description: 'Professional catering designed for business lunches and events.',
      image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
      startingPrice: 1500,
      features: ['Executive menus', 'Bulk packaging', 'Presentation ready'],
      status: 'active'
    },
    {
      id: 4,
      name: 'Festival Catering',
      description: 'Traditional and festive food service for family and community events.',
      image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80',
      startingPrice: 900,
      features: ['Seasonal menus', 'Family-style serving', 'Grand buffet'],
      status: 'active'
    }
  ];

  state.categories.forEach((category) => {
    const categoryFood = state.foodItems.find((food) => Number(food.categoryId) === Number(category.id));
    category.image = categoryFood?.image || '';
  });
  const dessertCategory = state.categories.find((category) => Number(category.id) === 9);
  if (dessertCategory) {
    dessertCategory.image = 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80';
  }

  state.coupons = [
    { id: 1, code: 'SAVE10', type: 'percentage', value: 10, minOrder: 300, maxDiscount: 100, expiryDate: '2026-12-31', usageLimit: 100, active: true },
    { id: 2, code: 'FLAT150', type: 'fixed', value: 150, minOrder: 600, maxDiscount: 150, expiryDate: '2026-12-31', usageLimit: 50, active: true }
  ];
}

module.exports = { state, seedData, hashPassword };
