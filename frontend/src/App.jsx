import { useCallback, useEffect, useId, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from './api';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const emptyPaymentSettings = {
  cashOnDeliveryEnabled: true,
  onlinePaymentEnabled: true,
  upiId: '',
  qrCodeImage: ''
};

const defaultFeaturedCombo = {
  label: 'Popular this week',
  name: 'Chef Special Combo',
  description: 'Paneer Platter + Biryani + Mango Lassi',
  price: 699,
  image: ''
};

const formatPortion = (food) => (
  Number(food.portionAmount) > 0 ? `${food.portionAmount} ${food.portionUnit || 'g'}` : ''
);

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [categories, setCategories] = useState([]);
  const [foodItems, setFoodItems] = useState([]);
  const [services, setServices] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(emptyPaymentSettings);
  const [featuredCombo, setFeaturedCombo] = useState(defaultFeaturedCombo);
  const [catalogReady, setCatalogReady] = useState(false);
  const [minimumSplashTimeElapsed, setMinimumSplashTimeElapsed] = useState(false);
  const [introEnabled] = useState(() => !document.documentElement.classList.contains('intro-seen'));
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState(() => {
    const stored = localStorage.getItem('cart');
    return stored ? JSON.parse(stored) : [];
  });
  const [adminData, setAdminData] = useState({
    summary: null,
    categories: [],
    foodItems: [],
    services: [],
    paymentSettings: emptyPaymentSettings,
    featuredCombo: defaultFeaturedCombo,
    orders: [],
    partyOrders: [],
    cateringRequests: [],
    customerList: [],
    messages: []
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  useEffect(() => {
    if (!introEnabled) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => setMinimumSplashTimeElapsed(true), reducedMotion ? 0 : 3500);
    return () => window.clearTimeout(timeout);
  }, [introEnabled]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [categoriesResponse, foodResponse, servicesResponse, featuredComboResponse] = await Promise.all([
          apiGet('/categories'),
          apiGet('/food'),
          apiGet('/catering-services'),
          apiGet('/featured-combo')
        ]);

        setCategories(categoriesResponse);
        setFoodItems(foodResponse);
        setServices(servicesResponse);
        setFeaturedCombo(featuredComboResponse);
      } catch (error) {
        console.error('Catalog load failed', error);
      } finally {
        setCatalogReady(true);
      }
    };

    loadCatalog();
  }, []);

  useEffect(() => {
    apiGet('/payment-details')
      .then(setPaymentSettings)
      .catch((error) => console.error('Payment details load failed', error));
  }, []);

  useEffect(() => {
    if (!introEnabled || !catalogReady || !minimumSplashTimeElapsed) return undefined;

    const splash = document.getElementById('startup-splash');
    if (!splash) return undefined;

    splash.classList.add('is-hidden');
    const timeout = window.setTimeout(() => splash.remove(), 500);
    return () => window.clearTimeout(timeout);
  }, [catalogReady, introEnabled, minimumSplashTimeElapsed]);

  useEffect(() => {
    const loadUserOrders = async () => {
      if (!token || !user) return;
      try {
        const ordersResponse = await apiGet('/my-orders', token);
        setOrders(ordersResponse);
      } catch (error) {
        console.error('Failed to load orders', error);
      }
    };

    loadUserOrders();
  }, [token, user]);

  const loadAdminDashboard = useCallback(async (providedToken = token) => {
    if (!providedToken || !user || user.role !== 'admin') return;

    try {
      const [summary, categoriesResp, foodResp, servicesResp, paymentSettingsResp, featuredComboResp, ordersResp, partyOrders, cateringRequests, customerList, messages] = await Promise.all([
        apiGet('/admin/summary', providedToken),
        apiGet('/admin/categories', providedToken),
        apiGet('/admin/food', providedToken),
        apiGet('/admin/catering-services', providedToken),
        apiGet('/admin/payment-details', providedToken),
        apiGet('/admin/featured-combo', providedToken),
        apiGet('/admin/orders', providedToken),
        apiGet('/admin/party-orders', providedToken),
        apiGet('/admin/catering-requests', providedToken),
        apiGet('/admin/customers', providedToken),
        apiGet('/admin/messages', providedToken)
      ]);

      setAdminData({
        summary,
        categories: categoriesResp,
        foodItems: foodResp,
        services: servicesResp,
        paymentSettings: paymentSettingsResp,
        featuredCombo: featuredComboResp,
        orders: ordersResp,
        partyOrders,
        cateringRequests,
        customerList,
        messages
      });
    } catch (error) {
      console.error('Admin dashboard load failed', error);
    }
  }, [token, user]);

  const handleAuth = async (payload, mode = 'login') => {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const response = await apiPost(endpoint, payload);
    setToken(response.token);
    setUser(response.user);
    return response;
  };

  const handleAdminLogin = async (payload) => {
    const response = await apiPost('/admin/login', payload);
    setToken(response.token);
    setUser(response.user);
    return response;
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setOrders([]);
  };

  const addToCart = (foodItem) => {
    const item = {
      id: foodItem.id,
      name: foodItem.name,
      image: foodItem.image,
      price: foodItem.discountPrice || foodItem.price,
      portionAmount: foodItem.portionAmount,
      portionUnit: foodItem.portionUnit,
      quantity: 1,
      customizations: []
    };

    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return current.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [...current, item];
    });
  };

  const removeFromCart = (id) => {
    setCart((current) => current.filter((item) => item.id !== id));
  };

  const adjustQuantity = (id, delta) => {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(1, Number(item.quantity) + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateOrderStatus = async (id, status) => {
    if (!token || !user || user.role !== 'admin') return;
    try {
      const updated = await apiPatch(`/admin/orders/${id}/status`, { status }, token);
      setAdminData((current) => ({
        ...current,
        orders: current.orders.map((order) => (Number(order.id) === Number(updated.id) ? updated : order))
      }));
    } catch (error) {
      console.error('Could not update order status', error);
    }
  };

  const updateFoodPrices = async (id, prices) => {
    const updated = await apiPatch(`/admin/food/${id}`, prices, token);
    setFoodItems((current) =>
      current.map((item) => (Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item))
    );
    setAdminData((current) => ({
      ...current,
      foodItems: current.foodItems.map((item) => (Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item))
    }));
    return updated;
  };

  const updatePaymentSettings = async (settings) => {
    const updated = await apiPatch('/admin/payment-details', settings, token);
    setPaymentSettings(updated);
    setAdminData((current) => ({ ...current, paymentSettings: updated }));
    return updated;
  };

  const updateFeaturedCombo = async (combo) => {
    const updated = await apiPatch('/admin/featured-combo', combo, token);
    setFeaturedCombo(updated);
    setAdminData((current) => ({ ...current, featuredCombo: updated }));
    return updated;
  };

  const uploadFeaturedComboImage = async (image) => {
    const updated = await apiUpload('/admin/featured-combo/image', image, token);
    setFeaturedCombo(updated);
    setAdminData((current) => ({ ...current, featuredCombo: updated }));
    return updated;
  };

  const deleteFeaturedComboImage = async () => {
    const updated = await apiDelete('/admin/featured-combo/image', token);
    setFeaturedCombo(updated);
    setAdminData((current) => ({ ...current, featuredCombo: updated }));
    return updated;
  };

  const uploadPaymentQrCode = async (image) => {
    const updated = await apiUpload('/admin/payment-details/qr-code', image, token);
    setPaymentSettings(updated);
    setAdminData((current) => ({ ...current, paymentSettings: updated }));
    return updated;
  };

  const deletePaymentQrCode = async () => {
    const updated = await apiDelete('/admin/payment-details/qr-code', token);
    setPaymentSettings(updated);
    setAdminData((current) => ({ ...current, paymentSettings: updated }));
    return updated;
  };

  const saveFoodItem = async (id, changes) => {
    const updated = await apiPatch(`/admin/food/${id}`, changes, token);
    const foodWithCategory = {
      ...updated,
      categoryName: adminData.categories.find((category) => Number(category.id) === Number(updated.categoryId))?.name || 'General'
    };
    setFoodItems((current) => current.map((item) => (Number(item.id) === Number(updated.id) ? foodWithCategory : item)));
    setAdminData((current) => ({
      ...current,
      foodItems: current.foodItems.map((item) => (Number(item.id) === Number(updated.id) ? foodWithCategory : item))
    }));
    return foodWithCategory;
  };

  const addFoodItem = async (food, image) => {
    const created = await apiPost('/admin/food', food, token);
    const saved = image ? await apiUpload(`/admin/food/${created.id}/image`, image, token) : created;
    const categoryName = adminData.categories.find((category) => Number(category.id) === Number(saved.categoryId))?.name || 'General';
    const foodWithCategory = { ...saved, categoryName };
    setFoodItems((current) => [...current, foodWithCategory]);
    setAdminData((current) => ({ ...current, foodItems: [...current.foodItems, foodWithCategory] }));
    return foodWithCategory;
  };

  const deleteFoodItem = async (id) => {
    await apiDelete(`/admin/food/${id}`, token);
    setFoodItems((current) => current.filter((item) => Number(item.id) !== Number(id)));
    setAdminData((current) => ({ ...current, foodItems: current.foodItems.filter((item) => Number(item.id) !== Number(id)) }));
  };

  const uploadFoodImage = async (id, file) => {
    const updated = await apiUpload(`/admin/food/${id}/image`, file, token);
    setFoodItems((current) =>
      current.map((item) => (Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item))
    );
    setAdminData((current) => ({
      ...current,
      foodItems: current.foodItems.map((item) => (Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item))
    }));
    return updated;
  };

  const createCategory = async (payload, image) => {
    const created = await apiPost('/admin/categories', payload, token);
    const saved = image ? await apiUpload(`/admin/categories/${created.id}/image`, image, token) : created;
    setAdminData((current) => ({ ...current, categories: [...current.categories, saved] }));
    if (saved.status === 'active') setCategories((current) => [...current, saved]);
    return saved;
  };

  const updateCategory = async (id, payload) => {
    const updated = await apiPatch(`/admin/categories/${id}`, payload, token);
    setAdminData((current) => ({
      ...current,
      categories: current.categories.map((category) => (Number(category.id) === Number(updated.id) ? updated : category))
    }));
    setCategories((current) => {
      const existing = current.some((category) => Number(category.id) === Number(updated.id));
      if (updated.status !== 'active') return current.filter((category) => Number(category.id) !== Number(updated.id));
      return existing
        ? current.map((category) => (Number(category.id) === Number(updated.id) ? updated : category))
        : [...current, updated];
    });
    setFoodItems((current) => current.map((food) =>
      Number(food.categoryId) === Number(updated.id) ? { ...food, categoryName: updated.name } : food
    ));
    setAdminData((current) => ({
      ...current,
      foodItems: current.foodItems.map((food) =>
        Number(food.categoryId) === Number(updated.id) ? { ...food, categoryName: updated.name } : food
      )
    }));
    return updated;
  };

  const uploadCategoryImage = async (id, image) => {
    const updated = await apiUpload(`/admin/categories/${id}/image`, image, token);
    setAdminData((current) => ({
      ...current,
      categories: current.categories.map((category) => (Number(category.id) === Number(updated.id) ? updated : category))
    }));
    setCategories((current) => current.map((category) => (Number(category.id) === Number(updated.id) ? updated : category)));
    return updated;
  };

  const deleteCategory = async (id) => {
    await apiDelete(`/admin/categories/${id}`, token);
    setAdminData((current) => ({ ...current, categories: current.categories.filter((category) => Number(category.id) !== Number(id)) }));
    setCategories((current) => current.filter((category) => Number(category.id) !== Number(id)));
  };

  const createCateringService = async (payload, image) => {
    const created = await apiPost('/admin/catering-services', payload, token);
    const saved = image ? await apiUpload(`/admin/catering-services/${created.id}/image`, image, token) : created;
    setAdminData((current) => ({ ...current, services: [...current.services, saved] }));
    if (saved.status === 'active') setServices((current) => [...current, saved]);
    return saved;
  };

  const updateCateringService = async (id, payload) => {
    const updated = await apiPatch(`/admin/catering-services/${id}`, payload, token);
    setAdminData((current) => ({
      ...current,
      services: current.services.map((service) => Number(service.id) === Number(updated.id) ? updated : service)
    }));
    setServices((current) => {
      const exists = current.some((service) => Number(service.id) === Number(updated.id));
      if (updated.status !== 'active') return current.filter((service) => Number(service.id) !== Number(updated.id));
      return exists
        ? current.map((service) => Number(service.id) === Number(updated.id) ? updated : service)
        : [...current, updated];
    });
    return updated;
  };

  const uploadCateringServiceImage = async (id, image) => {
    const updated = await apiUpload(`/admin/catering-services/${id}/image`, image, token);
    setAdminData((current) => ({
      ...current,
      services: current.services.map((service) => Number(service.id) === Number(updated.id) ? updated : service)
    }));
    setServices((current) => current.map((service) => Number(service.id) === Number(updated.id) ? updated : service));
    return updated;
  };

  const deleteCateringService = async (id) => {
    await apiDelete(`/admin/catering-services/${id}`, token);
    setAdminData((current) => ({
      ...current,
      services: current.services.filter((service) => Number(service.id) !== Number(id))
    }));
    setServices((current) => current.filter((service) => Number(service.id) !== Number(id)));
  };

  const updatePartyStatus = async (id, status) => {
    if (!token || !user || user.role !== 'admin') return;
    try {
      const updated = await apiPatch(`/admin/party-orders/${id}/status`, { status }, token);
      setAdminData((current) => ({
        ...current,
        partyOrders: current.partyOrders.map((request) =>
          Number(request.id) === Number(updated.id) ? updated : request
        )
      }));
    } catch (error) {
      console.error('Could not update party request status', error);
    }
  };

  const updateCateringStatus = async (id, status) => {
    if (!token || !user || user.role !== 'admin') return;
    try {
      const updated = await apiPatch(`/admin/catering-requests/${id}/status`, { status }, token);
      setAdminData((current) => ({
        ...current,
        cateringRequests: current.cateringRequests.map((request) =>
          Number(request.id) === Number(updated.id) ? updated : request
        )
      }));
    } catch (error) {
      console.error('Could not update catering request status', error);
    }
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header user={user} cart={cart} onLogout={handleLogout} />
        <main className="page-content">
          <Routes>
            <Route path="/" element={<HomePage categories={categories} foodItems={foodItems} addToCart={addToCart} featuredCombo={featuredCombo} />} />
            <Route
              path="/menu"
              element={<MenuPage categories={categories} foodItems={foodItems} addToCart={addToCart} />}
            />
            <Route
              path="/cart"
              element={
                <CartPage
                  cart={cart}
                  subtotal={cartSubtotal}
                  removeFromCart={removeFromCart}
                  adjustQuantity={adjustQuantity}
                  setCart={setCart}
                  token={token}
                />
              }
            />
            <Route
              path="/checkout"
              element={
                <CheckoutPage
                  cart={cart}
                  subtotal={cartSubtotal}
                  token={token}
                  user={user}
                  setCart={setCart}
                  paymentSettings={paymentSettings}
                />
              }
            />
            <Route
              path="/tracking"
              element={<OrderTrackingPage token={token} user={user} orders={orders} />}
            />
            <Route path="/party-orders" element={<PartyOrdersPage />} />
            <Route path="/events" element={<EventsPage services={services} />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route
              path="/profile"
              element={<ProfilePage user={user} orders={orders} token={token} />}
            />
            <Route
              path="/admin"
              element={
                <AdminPage
                  user={user}
                  token={token}
                  adminData={adminData}
                  foodItems={foodItems}
                  setAdminData={setAdminData}
                  onLogin={handleAdminLogin}
                  onRefresh={loadAdminDashboard}
                  onFoodCreate={addFoodItem}
                  onFoodUpdate={saveFoodItem}
                  onFoodDelete={deleteFoodItem}
                  onFoodPricesChange={updateFoodPrices}
                  onFoodImageUpload={uploadFoodImage}
                  onCategoryCreate={createCategory}
                  onCategoryUpdate={updateCategory}
                  onCategoryDelete={deleteCategory}
                  onCategoryImageUpload={uploadCategoryImage}
                  onCateringServiceCreate={createCateringService}
                  onCateringServiceUpdate={updateCateringService}
                  onCateringServiceDelete={deleteCateringService}
                  onCateringServiceImageUpload={uploadCateringServiceImage}
                  onPaymentSettingsUpdate={updatePaymentSettings}
                  onPaymentQrUpload={uploadPaymentQrCode}
                  onPaymentQrDelete={deletePaymentQrCode}
                  onFeaturedComboUpdate={updateFeaturedCombo}
                  onFeaturedComboImageUpload={uploadFeaturedComboImage}
                  onFeaturedComboImageDelete={deleteFeaturedComboImage}
                  onOrderStatusChange={updateOrderStatus}
                  onPartyStatusChange={updatePartyStatus}
                  onCateringStatusChange={updateCateringStatus}
                />
              }
            />
            <Route
              path="/login"
              element={<AuthPage onLogin={handleAuth} onRegister={handleAuth} user={user} />}
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

function Header({ user, cart, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const itemCount = cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link to="/" className="brand">
          <img src="/assets/cloud-kitchen-logo.jpg" alt="Cloud Kitchen" />
        </Link>

        <nav className={`main-nav${menuOpen ? ' mobile-open' : ''}`} onClick={() => setMenuOpen(false)}>
          <NavLink to="/">Home</NavLink>
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/party-orders">Party Orders</NavLink>
          <NavLink to="/events">Events &amp; Catering</NavLink>
          <NavLink to="/contact">Contact</NavLink>
          <NavLink to="/cart">Cart ({itemCount})</NavLink>
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <NavLink to="/profile">{user.name}</NavLink>
              {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
              <button className="button ghost" onClick={onLogout}>Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/login" className="button primary">Register</NavLink>
            </>
          )}
        </div>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

function HomePage({ categories, foodItems, addToCart, featuredCombo = defaultFeaturedCombo }) {
  const featuredItems = foodItems.filter((item) => item.featured).slice(0, 4);

  return (
    <>
      <section className="hero-section">
        <div className="container hero-content">
          <div className="hero-text">
            <span className="eyebrow">Freshly prepared</span>
            <h1>Delicious Food. Freshly Prepared. Delivered to Your Door.</h1>
            <p>Signature cloud kitchen meals crafted with quality ingredients and delivered fast.</p>
            <div className="hero-actions">
              <Link to="/menu" className="button primary large">Order Now</Link>
              <Link to="/menu" className="button secondary large">Explore Menu</Link>
            </div>
          </div>
          <div className="hero-card">
            {featuredCombo.image && <img className="hero-combo-image" src={featuredCombo.image} alt={featuredCombo.name} />}
            <div className="badge">{featuredCombo.label}</div>
            <h3>{featuredCombo.name}</h3>
            <p>{featuredCombo.description}</p>
            <strong>{formatCurrency(featuredCombo.price)}</strong>
          </div>
        </div>
      </section>

      <section className="section home-categories">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Browse by taste</p>
            <h2>Featured Categories</h2>
          </div>
          <div className="category-grid">
            {categories.filter((category) => category.featured !== false).map((category) => (
              <Link
                key={category.id}
                to={`/menu?category=${encodeURIComponent(category.id)}`}
                className={`category-card${category.image ? '' : ' no-image'}`}
                aria-label={`Browse ${category.name}`}
              >
                {category.image && <img src={category.image} alt={category.name} />}
                <div className="category-overlay">
                  <span>{category.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt home-products">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Best sellers</p>
            <h2>Popular Items</h2>
          </div>
          <div className="product-grid">
            {featuredItems.map((food) => (
              <FoodCard key={food.id} food={food} addToCart={addToCart} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function MenuPage({ categories, foodItems, addToCart }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const category = searchParams.get('category') || 'all';
  const [vegOnly, setVegOnly] = useState(false);
  const [sortBy, setSortBy] = useState('featured');

  const updateCategory = (value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'all') {
      nextParams.delete('category');
    } else {
      nextParams.set('category', value);
    }
    setSearchParams(nextParams);
  };

  const filtered = foodItems
    .filter((food) => {
      const matchesSearch = food.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'all' || Number(food.categoryId) === Number(category);
      const matchesVeg = !vegOnly || food.veg;
      return matchesSearch && matchesCategory && matchesVeg;
    })
    .sort((a, b) => {
      if (sortBy === 'price-low') return (a.discountPrice || a.price) - (b.discountPrice || b.price);
      if (sortBy === 'price-high') return (b.discountPrice || b.price) - (a.discountPrice || a.price);
      if (sortBy === 'popular') return (b.rating || 0) - (a.rating || 0);
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    });

  return (
    <div className="container section page-space">
      <div className="menu-toolbar">
        <input
          type="text"
          placeholder="Search food"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={category} onChange={(event) => updateCategory(event.target.value)}>
          <option value="all">All Categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <label className="checkbox-row">
          <input type="checkbox" checked={vegOnly} onChange={(event) => setVegOnly(event.target.checked)} />
          Veg only
        </label>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="featured">Featured</option>
          <option value="popular">Popularity</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
      </div>

      <div className="product-grid">
        {filtered.map((food) => (
          <FoodCard key={food.id} food={food} addToCart={addToCart} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <p>No food items match this category or your current filters.</p>
          <Link to="/menu" className="button secondary">Browse all food</Link>
        </div>
      )}
    </div>
  );
}

function FoodCard({ food, addToCart }) {
  const price = food.discountPrice || food.price;

  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <img src={food.image} alt={food.name} />
        <span className={`veg-badge ${food.veg ? 'veg' : 'non-veg'}`}>{food.veg ? 'Veg' : 'Non-Veg'}</span>
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span>{food.categoryName || 'Dish'}</span>
          <span>⭐ {food.rating || 4.6}</span>
        </div>
        <h3>{food.name}</h3>
        <p>{food.description}</p>
        {formatPortion(food) && <p className="product-portion">Serving size: {formatPortion(food)}</p>}
        <div className="price-row">
          <strong>{formatCurrency(price)}</strong>
          {food.discountPrice && <span>{formatCurrency(food.price)}</span>}
        </div>
        <div className="product-details">
          <small>{food.availability === 'available' ? 'Available now' : 'Out of stock'}</small>
          <small>{food.preparationTime || 20} mins</small>
        </div>
        <button className="button primary full" onClick={() => addToCart(food)}>
          Add to Cart
        </button>
      </div>
    </article>
  );
}

function CartPage({ cart, subtotal, removeFromCart, adjustQuantity, setCart, token }) {
  const [couponCode, setCouponCode] = useState('');
  const [couponMsg, setCouponMsg] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);

  const deliveryFee = subtotal > 0 ? 35 : 0;
  const tax = (subtotal - couponDiscount) * 0.05;
  const total = subtotal - couponDiscount + deliveryFee + tax;

  const applyCoupon = async () => {
    try {
      const response = await apiPost('/coupons/apply', { code: couponCode, subtotal }, token);
      setCouponDiscount(response.discount || 0);
      setCouponMsg(response.valid ? `Coupon applied: ${response.discount} off.` : 'Coupon not valid for this order.');
    } catch (error) {
      setCouponMsg(error.message);
      setCouponDiscount(0);
    }
  };

  if (!cart.length) {
    return (
      <div className="container section text-center page-space">
        <h2>Your cart is empty</h2>
        <Link to="/menu" className="button primary">Browse Menu</Link>
      </div>
    );
  }

  return (
    <div className="container section page-space">
      <div className="cart-layout">
        <div className="cart-items">
          {cart.map((item) => (
            <div key={item.id} className="cart-item">
              <img src={item.image} alt={item.name} />
              <div className="cart-item-info">
                <h3>{item.name}</h3>
                <small>{item.customizations?.length ? item.customizations.join(', ') : 'No customizations'}</small>
                {formatPortion(item) && <small>Serving size: {formatPortion(item)}</small>}
                <div className="qty-row">
                  <button onClick={() => adjustQuantity(item.id, -1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => adjustQuantity(item.id, 1)}>+</button>
                </div>
              </div>
              <div className="cart-item-price">
                <strong>{formatCurrency(Number(item.price) * Number(item.quantity))}</strong>
                <button className="text-button" onClick={() => removeFromCart(item.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        <aside className="summary-box">
          <h3>Order Summary</h3>
          <div className="summary-row"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
          <div className="summary-row"><span>Discount</span><strong>-{formatCurrency(couponDiscount)}</strong></div>
          <div className="summary-row"><span>Delivery Fee</span><strong>{formatCurrency(deliveryFee)}</strong></div>
          <div className="summary-row"><span>Tax</span><strong>{formatCurrency(tax)}</strong></div>
          <div className="summary-total"><span>Grand Total</span><strong>{formatCurrency(total)}</strong></div>

          <div className="coupon-box">
            <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Coupon code" />
            <button className="button secondary full" onClick={applyCoupon}>Apply</button>
            {couponMsg && <small>{couponMsg}</small>}
          </div>

          <Link to="/checkout" className="button primary full">Proceed to Checkout</Link>
        </aside>
      </div>
    </div>
  );
}

function CheckoutPage({ cart, subtotal, token, user, setCart, paymentSettings }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customerName: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    address: user?.address || '',
    landmark: '',
    pincode: '',
    instructions: '',
    paymentMethod: 'cod'
  });
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (form.paymentMethod === 'cod' && !paymentSettings.cashOnDeliveryEnabled && paymentSettings.onlinePaymentEnabled) {
      setForm((current) => ({ ...current, paymentMethod: 'online' }));
    } else if (form.paymentMethod === 'online' && !paymentSettings.onlinePaymentEnabled && paymentSettings.cashOnDeliveryEnabled) {
      setForm((current) => ({ ...current, paymentMethod: 'cod' }));
    }
  }, [form.paymentMethod, paymentSettings.cashOnDeliveryEnabled, paymentSettings.onlinePaymentEnabled]);

  const deliveryFee = subtotal > 0 ? 35 : 0;
  const tax = (subtotal - couponDiscount) * 0.05;
  const total = subtotal - couponDiscount + deliveryFee + tax;

  const applyCoupon = async () => {
    try {
      const response = await apiPost('/coupons/apply', { code: couponCode, subtotal }, token);
      setCouponDiscount(response.discount || 0);
    } catch (error) {
      setCouponDiscount(0);
      setError(error.message);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          portionAmount: item.portionAmount,
          portionUnit: item.portionUnit,
          customizations: item.customizations || []
        })),
        ...form,
        userId: user?.id || null,
        couponCode: couponCode || null
      };

      const response = await apiPost('/orders', payload, token);
      setCart([]);
      navigate(`/tracking?orderId=${response.id}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!cart.length) {
    return (
      <div className="container section text-center page-space">
        <h2>Your cart is empty</h2>
        <Link to="/menu" className="button primary">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="container section page-space">
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <h2>Delivery Details</h2>
          <div className="two-column">
            <input name="customerName" value={form.customerName} onChange={handleChange} placeholder="Full Name" required />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone Number" required />
            <input name="email" value={form.email} onChange={handleChange} placeholder="Email" type="email" required />
            <input name="pincode" value={form.pincode} onChange={handleChange} placeholder="Pincode" />
          </div>
          <textarea name="address" value={form.address} onChange={handleChange} placeholder="Delivery Address" rows="3" required />
          <div className="two-column">
            <input name="landmark" value={form.landmark} onChange={handleChange} placeholder="Landmark" />
            <input name="instructions" value={form.instructions} onChange={handleChange} placeholder="Special Instructions" />
          </div>

          <div className="payment-methods">
            {paymentSettings.cashOnDeliveryEnabled && (
              <label>
                <input type="radio" name="paymentMethod" value="cod" checked={form.paymentMethod === 'cod'} onChange={handleChange} />
                Cash on Delivery
              </label>
            )}
            {paymentSettings.onlinePaymentEnabled && (
              <label>
                <input type="radio" name="paymentMethod" value="online" checked={form.paymentMethod === 'online'} onChange={handleChange} />
                Online Payment
              </label>
            )}
          </div>
          {form.paymentMethod === 'online' && (
            <div className="checkout-payment-details">
              <strong>Pay by UPI</strong>
              {paymentSettings.upiId && <span>UPI ID: {paymentSettings.upiId}</span>}
              {paymentSettings.qrCodeImage && <img className="checkout-payment-qr" src={paymentSettings.qrCodeImage} alt="UPI payment QR code" />}
              {!paymentSettings.upiId && !paymentSettings.qrCodeImage && (
                <p>UPI payment details have not been added yet. Please contact the kitchen before placing an online payment order.</p>
              )}
              <small>Online transfers are handled manually; payment is not verified by this checkout.</small>
            </div>
          )}

          <div className="coupon-box checkout-coupon">
            <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Apply coupon" />
            <button type="button" className="button secondary" onClick={applyCoupon}>Apply</button>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="button primary full" disabled={loading}>
            {loading ? 'Placing Order...' : 'Place Order'}
          </button>
        </form>

        <aside className="summary-box">
          <h3>Order Summary</h3>
          {cart.map((item) => (
            <div key={item.id} className="mini-item">
              <span>
                {item.name} × {item.quantity}
                {formatPortion(item) && <small className="mini-item-portion">{formatPortion(item)} each</small>}
              </span>
              <strong>{formatCurrency(Number(item.price) * Number(item.quantity))}</strong>
            </div>
          ))}
          <div className="summary-row"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
          <div className="summary-row"><span>Discount</span><strong>-{formatCurrency(couponDiscount)}</strong></div>
          <div className="summary-row"><span>Delivery</span><strong>{formatCurrency(deliveryFee)}</strong></div>
          <div className="summary-row"><span>Taxes</span><strong>{formatCurrency(tax)}</strong></div>
          <div className="summary-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
        </aside>
      </div>
    </div>
  );
}

function OrderTrackingPage({ token, user, orders }) {
  const [trackingId, setTrackingId] = useState('');
  const [trackedOrder, setTrackedOrder] = useState(null);
  const [error, setError] = useState('');

  const fetchOrder = async () => {
    try {
      const order = await apiGet(`/orders/${trackingId}`);
      setTrackedOrder(order);
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    }
  };

  return (
    <div className="container section page-space">
      <h2>Order Tracking</h2>
      <div className="tracking-panel">
        <div className="tracking-search">
          <input value={trackingId} onChange={(event) => setTrackingId(event.target.value)} placeholder="Enter order ID" />
          <button className="button primary" onClick={fetchOrder}>Track</button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {(trackedOrder || (user && orders.length)) && (
        <div className="orders-panel">
          {(trackedOrder ? [trackedOrder] : orders).map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div>
                  <strong>Order #{order.id}</strong>
                  <p>{new Date(order.createdAt).toLocaleString()}</p>
                </div>
                <span className="status-badge">{order.status}</span>
              </div>
              <ul>
                {order.items?.map((item, index) => (
                  <li key={`${order.id}-${index}`}>
                    {item.name} × {item.quantity}{formatPortion(item) ? ` (${formatPortion(item)} each)` : ''} — {formatCurrency(item.totalPrice || item.unitPrice * item.quantity)}
                  </li>
                ))}
              </ul>
              <div className="order-footer">
                <span>Delivery to: {order.address}</span>
                <strong>{formatCurrency(order.total)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartyOrdersPage() {
  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    eventType: '',
    eventDate: '',
    eventTime: '',
    guestCount: '',
    venue: '',
    foodPreferences: '',
    vegetarian: true,
    budget: '',
    specialRequirements: '',
    additionalMessage: ''
  });
  const [submitted, setSubmitted] = useState('');

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const response = await apiPost('/party-orders', form);
    setSubmitted(`Party request submitted. Your request ID is #${response.id}`);
    setForm({
      customerName: '',
      phone: '',
      email: '',
      eventType: '',
      eventDate: '',
      eventTime: '',
      guestCount: '',
      venue: '',
      foodPreferences: '',
      vegetarian: true,
      budget: '',
      specialRequirements: '',
      additionalMessage: ''
    });
  };

  return (
    <div className="container section page-space">
      <div className="form-shell large-form">
        <h2>Party Order Request</h2>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="two-column">
            <input name="customerName" value={form.customerName} onChange={handleChange} placeholder="Customer Name" required />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" required />
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" required />
            <input name="eventType" value={form.eventType} onChange={handleChange} placeholder="Event Type" required />
            <input name="eventDate" type="date" value={form.eventDate} onChange={handleChange} required />
            <input name="eventTime" value={form.eventTime} onChange={handleChange} placeholder="Event Time" />
            <input name="guestCount" value={form.guestCount} onChange={handleChange} placeholder="Number of Guests" />
            <input name="venue" value={form.venue} onChange={handleChange} placeholder="Venue/Address" />
          </div>
          <textarea name="foodPreferences" value={form.foodPreferences} onChange={handleChange} placeholder="Food Preferences" rows="3" />
          <label className="checkbox-row">
            <input type="checkbox" name="vegetarian" checked={form.vegetarian} onChange={handleChange} />
            Vegetarian menu preferred
          </label>
          <div className="two-column">
            <input name="budget" value={form.budget} onChange={handleChange} placeholder="Budget (₹)" />
            <input name="specialRequirements" value={form.specialRequirements} onChange={handleChange} placeholder="Special Requirements" />
          </div>
          <textarea name="additionalMessage" value={form.additionalMessage} onChange={handleChange} placeholder="Additional Message" rows="3" />
          <button className="button primary" type="submit">Submit Party Request</button>
          {submitted && <p className="success-text">{submitted}</p>}
        </form>
      </div>
    </div>
  );
}

function EventsPage({ services }) {
  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    serviceName: '',
    eventType: '',
    eventDate: '',
    guestCount: '',
    budget: '',
    requirements: ''
  });
  const [success, setSuccess] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const response = await apiPost('/catering-requests', form);
    setSuccess(`Quote request submitted successfully. Reference #${response.id}`);
    setForm({
      customerName: '',
      phone: '',
      email: '',
      serviceName: '',
      eventType: '',
      eventDate: '',
      guestCount: '',
      budget: '',
      requirements: ''
    });
  };

  return (
    <div className="container section page-space">
      <div className="section-heading">
        <p className="eyebrow">Celebrate with us</p>
        <h2>Events &amp; Catering</h2>
      </div>

      <div className="service-grid">
        {services.map((service) => (
          <div key={service.id} className="service-card">
            <img src={service.image} alt={service.name} />
            <div className="service-body">
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <ul>
                {service.features.map((feature, index) => (
                  <li key={`${service.id}-${index}`}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="form-shell large-form">
        <h3>Request a Quote</h3>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="two-column">
            <input name="customerName" value={form.customerName} onChange={handleChange} placeholder="Your Name" required />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone Number" required />
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" required />
            <input name="serviceName" value={form.serviceName} onChange={handleChange} placeholder="Service Required" required />
            <input name="eventType" value={form.eventType} onChange={handleChange} placeholder="Event Type" />
            <input name="eventDate" type="date" value={form.eventDate} onChange={handleChange} />
            <input name="guestCount" value={form.guestCount} onChange={handleChange} placeholder="Number of Guests" />
            <input name="budget" value={form.budget} onChange={handleChange} placeholder="Budget (₹)" />
          </div>
          <textarea name="requirements" value={form.requirements} onChange={handleChange} placeholder="Requirements" rows="4" />
          <button className="button primary" type="submit">Request a Quote</button>
          {success && <p className="success-text">{success}</p>}
        </form>
      </div>
    </div>
  );
}

function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [success, setSuccess] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const response = await apiPost('/contact', form);
    setSuccess(`Thanks! Your message has been submitted. ID #${response.id}`);
    setForm({
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: ''
    });
  };

  return (
    <div className="container section page-space">
      <div className="contact-layout">
        <div className="contact-card">
          <h2>Contact Us</h2>
          <ul className="contact-list">
            <li>📞 <a href="tel:8333948189">8333948189</a></li>
            <li>📧 <a href="mailto:ascloudkitchenofficial@gmail.com">ascloudkitchenofficial@gmail.com</a></li>
            <li>📍 Guntur, Andhra Pradesh</li>
            <li>🕒 Mon-Sun: 9:00 AM - 11:00 PM</li>
          </ul>
          <div className="map-box">Map location placeholder</div>
        </div>

        <form className="form-shell" onSubmit={handleSubmit}>
          <h3>Send us a message</h3>
          <input name="name" value={form.name} onChange={handleChange} placeholder="Name" required />
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" required />
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" />
          <input name="subject" value={form.subject} onChange={handleChange} placeholder="Subject" />
          <textarea name="message" value={form.message} onChange={handleChange} placeholder="Message" rows="4" required />
          <button className="button primary" type="submit">Send Message</button>
          {success && <p className="success-text">{success}</p>}
        </form>
      </div>
    </div>
  );
}

function ProfilePage({ user, orders, token }) {
  if (!user) {
    return (
      <div className="container section page-space text-center">
        <h2>Please log in to view your profile.</h2>
        <Link to="/login" className="button primary">Login</Link>
      </div>
    );
  }

  return (
    <div className="container section page-space">
      <div className="profile-shell">
        <h2>My Profile</h2>
        <div className="profile-card">
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Phone:</strong> {user.phone}</p>
          <p><strong>Address:</strong> {user.address || 'Not added yet'}</p>
        </div>

        <div className="orders-panel">
          <h3>Previous Orders</h3>
          {orders.length ? (
            orders.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div>
                    <strong>Order #{order.id}</strong>
                    <p>{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="status-badge">{order.status}</span>
                </div>
                <ul>
                  {order.items?.map((item, index) => (
                    <li key={`${order.id}-${index}`}>
                      {item.name} × {item.quantity} — {formatCurrency(item.totalPrice || item.unitPrice * item.quantity)}
                    </li>
                  ))}
                </ul>
                <div className="order-footer">
                  <span>{order.paymentMethod}</span>
                  <strong>{formatCurrency(order.total)}</strong>
                </div>
              </div>
            ))
          ) : (
            <p>No orders yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthPage({ onLogin, onRegister, user }) {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    address: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/profile');
    }
  }, [user, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (isRegister && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        address: form.address
      };

      await (isRegister ? onRegister(payload, 'register') : onLogin(payload, 'login'));
      navigate('/profile');
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed.');
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  return (
    <div className="container section page-space auth-wrap">
      <div className="auth-box">
        <div className="auth-toggle">
          <button type="button" className={!isRegister ? 'active' : ''} onClick={() => setIsRegister(false)}>Login</button>
          <button type="button" className={isRegister ? 'active' : ''} onClick={() => setIsRegister(true)}>Register</button>
        </div>

        <form onSubmit={handleSubmit} className="stacked-form">
          {isRegister && <input name="name" value={form.name} onChange={handleChange} placeholder="Full Name" required />}
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" required />
          {isRegister && <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone Number" required />}
          <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Password" required />
          {isRegister && <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="Confirm Password" required />}
          {isRegister && <textarea name="address" value={form.address} onChange={handleChange} placeholder="Delivery Address" rows="3" />}
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="button primary full">
            {isRegister ? 'Create Account' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminPage({
  user,
  token,
  adminData,
  onLogin,
  onRefresh,
  onFoodCreate,
  onFoodUpdate,
  onFoodDelete,
  onFoodPricesChange,
  onFoodImageUpload,
  onCategoryCreate,
  onCategoryUpdate,
  onCategoryDelete,
  onCategoryImageUpload,
  onCateringServiceCreate,
  onCateringServiceUpdate,
  onCateringServiceDelete,
  onCateringServiceImageUpload,
  onPaymentSettingsUpdate,
  onPaymentQrUpload,
  onPaymentQrDelete,
  onFeaturedComboUpdate,
  onFeaturedComboImageUpload,
  onFeaturedComboImageDelete,
  onOrderStatusChange,
  onPartyStatusChange,
  onCateringStatusChange
}) {
  const [loginForm, setLoginForm] = useState({ email: 'ascloudkitchenofficial@gmail.com', password: '' });
  const [error, setError] = useState('');

  const isAdmin = user && user.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      onRefresh(token);
    }
  }, [isAdmin, token, onRefresh]);

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      await onLogin(loginForm);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container section page-space auth-wrap">
        <div className="auth-box admin-box">
          <h2>Admin Login</h2>
          <form onSubmit={handleLogin} className="stacked-form">
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Admin email"
              required
            />
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              required
            />
            {error && <p className="error-text">{error}</p>}
            <button className="button primary full" type="submit">Login as Admin</button>
          </form>
        </div>
      </div>
    );
  }

  const summary = adminData.summary || {
    totalOrders: 0,
    todaysOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    partyOrders: 0,
    cateringRequests: 0,
    lowStock: 0
  };

  return (
    <div className="container section page-space admin-shell">
      <div className="admin-topbar">
        <h2>Admin Dashboard</h2>
        <button className="button secondary" onClick={() => onRefresh(token)}>Refresh</button>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Orders" value={summary.totalOrders} accent="orange" />
        <StatCard label="Today's Orders" value={summary.todaysOrders} accent="green" />
        <StatCard label="Pending Orders" value={summary.pendingOrders} accent="blue" />
        <StatCard label="Completed Orders" value={summary.completedOrders} accent="purple" />
        <StatCard label="Revenue" value={formatCurrency(summary.totalRevenue)} accent="red" />
        <StatCard label="Customers" value={summary.totalCustomers} accent="gold" />
        <StatCard label="Party Requests" value={summary.partyOrders} accent="slate" />
        <StatCard label="Catering Requests" value={summary.cateringRequests} accent="teal" />
      </div>

      <FoodManagementPanel
        foodItems={adminData.foodItems}
        categories={adminData.categories}
        onFoodCreate={onFoodCreate}
        onFoodUpdate={onFoodUpdate}
        onFoodDelete={onFoodDelete}
        onPricesChange={onFoodPricesChange}
        onImageUpload={onFoodImageUpload}
      />

      <CategoryManagementPanel
        categories={adminData.categories}
        onCategoryCreate={onCategoryCreate}
        onCategoryUpdate={onCategoryUpdate}
        onCategoryDelete={onCategoryDelete}
        onImageUpload={onCategoryImageUpload}
      />

      <CateringServiceManagementPanel
        services={adminData.services}
        onCreate={onCateringServiceCreate}
        onUpdate={onCateringServiceUpdate}
        onDelete={onCateringServiceDelete}
        onImageUpload={onCateringServiceImageUpload}
      />

      <PaymentSettingsPanel
        settings={adminData.paymentSettings || emptyPaymentSettings}
        onSave={onPaymentSettingsUpdate}
        onQrUpload={onPaymentQrUpload}
        onQrDelete={onPaymentQrDelete}
      />

      <FeaturedComboManagementPanel
        combo={adminData.featuredCombo || defaultFeaturedCombo}
        onUpdate={onFeaturedComboUpdate}
        onImageUpload={onFeaturedComboImageUpload}
        onImageDelete={onFeaturedComboImageDelete}
      />

      <div className="panel-grid">
        <div className="panel-box">
          <h3>Orders</h3>
          <table>
            <thead>
              <tr><th>ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminData.orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customerName}</td>
                  <td>{formatCurrency(order.total)}</td>
                  <td>
                    <select value={order.status} onChange={(event) => onOrderStatusChange(order.id, event.target.value)}>
                      {['Pending','Confirmed','Preparing','Ready','Out for Delivery','Delivered','Cancelled'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-box">
          <h3>Party Orders</h3>
          <table>
            <thead>
              <tr><th>ID</th><th>Event</th><th>Guests</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminData.partyOrders.map((request) => (
                <tr key={request.id}>
                  <td>#{request.id}</td>
                  <td>{request.eventType}</td>
                  <td>{request.guestCount}</td>
                  <td>
                    <select value={request.status} onChange={(event) => onPartyStatusChange(request.id, event.target.value)}>
                      {['New','Contacted','Quotation Sent','Confirmed','Completed','Cancelled'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel-box">
          <h3>Catering Requests</h3>
          <table>
            <thead>
              <tr><th>ID</th><th>Service</th><th>Budget</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminData.cateringRequests.map((request) => (
                <tr key={request.id}>
                  <td>#{request.id}</td>
                  <td>{request.serviceName}</td>
                  <td>{formatCurrency(request.budget)}</td>
                  <td>
                    <select value={request.status} onChange={(event) => onCateringStatusChange(request.id, event.target.value)}>
                      {['New','Contacted','Quotation Sent','Confirmed','Completed','Cancelled'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-box">
          <h3>Customers</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Orders</th></tr>
            </thead>
            <tbody>
              {adminData.customerList.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FeaturedComboManagementPanel({ combo, onUpdate, onImageUpload, onImageDelete }) {
  const [form, setForm] = useState(combo);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setForm(combo), [combo]);

  useEffect(() => {
    if (!image) {
      setPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await onUpdate({ ...form, price: Number(form.price) });
      setForm(updated);
      setMessage('Popular combo updated on the homepage.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!image) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await onImageUpload(image);
      setForm(updated);
      setImage(null);
      setMessage('Combo image updated on the homepage.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await onImageDelete();
      setForm(updated);
      setImage(null);
      setMessage('Combo image removed.');
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="food-management-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Homepage highlight</p>
          <h3>Popular This Week Combo</h3>
        </div>
      </div>
      <form className="payment-settings-form" onSubmit={save}>
        <div className="catalog-form-grid featured-combo-fields">
          <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Small label" maxLength="80" required />
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Combo title" maxLength="120" required />
          <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="Price (₹)" required />
        </div>
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Combo description" rows="2" maxLength="300" required />
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save combo details'}</button>
      </form>
      <div className="featured-combo-image-controls">
        {(preview || form.image) && <img src={preview || form.image} alt="Popular combo preview" />}
        <label className="image-file-label">
          <span>{image ? image.name : 'Choose combo image (optional)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            setImage(event.target.files?.[0] || null);
            event.target.value = '';
            setError('');
            setMessage('');
          }} />
        </label>
        <button className="button secondary" type="button" disabled={busy || !image} onClick={upload}>{busy ? 'Uploading…' : 'Upload image'}</button>
        {form.image && <button className="text-button delete-item-button" type="button" disabled={busy} onClick={removeImage}>Remove image</button>}
      </div>
      {(error || message) && <p className={error ? 'error-text' : 'success-text'} role="status">{error || message}</p>}
    </section>
  );
}

function PaymentSettingsPanel({ settings, onSave, onQrUpload, onQrDelete }) {
  const [form, setForm] = useState(settings);
  const [qrImage, setQrImage] = useState(null);
  const [qrPreview, setQrPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!qrImage) {
      setQrPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(qrImage);
    setQrPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [qrImage]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await onSave(form);
      setForm(saved);
      setMessage('Payment details saved and applied to checkout.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadQrCode = async () => {
    if (!qrImage) return;
    setQrBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await onQrUpload(qrImage);
      setForm(saved);
      setQrImage(null);
      setMessage('UPI QR code uploaded and shown at checkout.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setQrBusy(false);
    }
  };

  const removeQrCode = async () => {
    setQrBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await onQrDelete();
      setForm(saved);
      setQrImage(null);
      setMessage('UPI QR code removed.');
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setQrBusy(false);
    }
  };

  return (
    <section className="food-management-panel payment-settings-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Checkout controls</p>
          <h3>Payment Details</h3>
        </div>
      </div>
      <p className="payment-settings-help">
        Set the UPI ID customers can pay to, upload a UPI QR code, or use both. Customers see these details when they choose online payment.
      </p>
      <form className="payment-settings-form" onSubmit={handleSubmit}>
        <div className="catalog-options">
          <label className="checkbox-row">
            <input type="checkbox" checked={form.cashOnDeliveryEnabled} onChange={(event) => setForm((current) => ({ ...current, cashOnDeliveryEnabled: event.target.checked }))} />
            Enable Cash on Delivery
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.onlinePaymentEnabled} onChange={(event) => setForm((current) => ({ ...current, onlinePaymentEnabled: event.target.checked }))} />
            Enable Online Payment
          </label>
        </div>
        <div className="payment-upi-field">
          <label htmlFor="payment-upi-id">UPI ID</label>
          <input id="payment-upi-id" value={form.upiId} onChange={(event) => setForm((current) => ({ ...current, upiId: event.target.value }))} placeholder="example@upi" maxLength="120" />
        </div>
        <div className="payment-qr-editor">
          <div className="payment-qr-preview">
            {(qrPreview || settings.qrCodeImage) && (
              <img src={qrPreview || settings.qrCodeImage} alt="UPI QR code preview" />
            )}
            {!qrPreview && !settings.qrCodeImage && <span>No QR code uploaded</span>}
          </div>
          <div className="payment-qr-actions">
            <label className="image-file-label">
              <span>{qrImage ? qrImage.name : 'Choose UPI QR image'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                setQrImage(event.target.files?.[0] || null);
                event.target.value = '';
                setError('');
                setMessage('');
              }} />
            </label>
            <button className="button secondary" type="button" disabled={qrBusy || !qrImage} onClick={uploadQrCode}>
              {qrBusy ? 'Uploading…' : 'Upload QR code'}
            </button>
            {settings.qrCodeImage && (
              <button className="text-button delete-item-button" type="button" disabled={qrBusy} onClick={removeQrCode}>
                Remove QR
              </button>
            )}
          </div>
          <small>JPG, PNG, or WebP; up to 5 MB.</small>
        </div>
        {(error || message) && <p className={error ? 'error-text' : 'success-text'} role="status">{error || message}</p>}
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save payment details'}</button>
      </form>
    </section>
  );
}

function FoodManagementPanel({ foodItems, categories, onFoodCreate, onFoodUpdate, onFoodDelete, onPricesChange, onImageUpload }) {
  const [addingFood, setAddingFood] = useState(false);

  return (
    <section className="food-management-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Catalog controls</p>
          <h3>Food &amp; Menu Items</h3>
        </div>
        <div className="admin-heading-actions">
          <span>{foodItems.length} menu items</span>
          <button className="button primary" type="button" onClick={() => setAddingFood((value) => !value)}>
            {addingFood ? 'Close form' : 'Add food item'}
          </button>
        </div>
      </div>
      {addingFood && (
        <AddFoodForm
          categories={categories}
          onCreate={onFoodCreate}
          onCancel={() => setAddingFood(false)}
        />
      )}
      <div className="food-management-list">
        {foodItems.map((food) => (
          <FoodManagementRow
            key={food.id}
            food={food}
            categories={categories}
            onFoodUpdate={onFoodUpdate}
            onFoodDelete={onFoodDelete}
            onPricesChange={onPricesChange}
            onImageUpload={onImageUpload}
          />
        ))}
        {!foodItems.length && !addingFood && <p className="food-management-empty">No food items are available to manage.</p>}
      </div>
    </section>
  );
}

function AddFoodForm({ categories, onCreate, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: categories[0]?.id || '',
    price: '',
    discountPrice: '0',
    veg: true,
    preparationTime: 20,
    availability: 'available',
    featured: false,
    stock: 10,
    portionAmount: '',
    portionUnit: 'g',
    ingredients: ''
  });
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!image) {
        setError('Choose a food image before adding the menu item.');
        setBusy(false);
        return;
      }

      await onCreate({
        ...form,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
        discountPrice: Number(form.discountPrice || 0),
        preparationTime: Number(form.preparationTime),
        stock: Number(form.stock),
        ingredients: form.ingredients
      }, image);
      onCancel();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="catalog-editor add-food-form" onSubmit={submit}>
      <h4>Add a menu item</h4>
      <div className="catalog-form-grid">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Food name" required />
        <select name="categoryId" value={form.categoryId} onChange={handleChange} required>
          <option value="" disabled>Select a category</option>
          {categories.filter((category) => category.status === 'active').map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={handleChange} placeholder="Regular price" required />
        <input name="discountPrice" type="number" min="0" step="0.01" value={form.discountPrice} onChange={handleChange} placeholder="Discount price" required />
        <input name="preparationTime" type="number" min="1" value={form.preparationTime} onChange={handleChange} placeholder="Preparation minutes" required />
        <input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} placeholder="Stock quantity" required />
        <label className="portion-size-input">
          <span>Serving size</span>
          <input name="portionAmount" type="number" min="0.1" step="0.1" value={form.portionAmount} onChange={handleChange} placeholder="e.g. 500" />
          <select name="portionUnit" value={form.portionUnit} onChange={handleChange} aria-label="Serving size unit">
            <option value="g">grams (g)</option>
            <option value="kg">kilograms (kg)</option>
          </select>
        </label>
      </div>
      <textarea name="description" value={form.description} onChange={handleChange} placeholder="Food description" rows="2" />
      <input name="ingredients" value={form.ingredients} onChange={handleChange} placeholder="Ingredients, separated by commas" />
      <div className="catalog-options">
        <FoodTypeField value={form.veg} onChange={(veg) => setForm((current) => ({ ...current, veg }))} />
        <label className="checkbox-row"><input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} /> Show in Popular Items</label>
        <label className="checkbox-row"><input type="checkbox" checked={form.availability === 'available'} onChange={(event) => setForm((current) => ({ ...current, availability: event.target.checked ? 'available' : 'out_of_stock' }))} /> Available to order</label>
      </div>
      <div className="catalog-image-picker">
        {previewUrl && <img src={previewUrl} alt="New food image preview" />}
        <label className="image-file-label">
          <span>          {image ? image.name : 'Choose food image (required)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="catalog-form-actions">
        <button className="button primary" type="submit" disabled={busy || !image || !categories.some((category) => category.status === 'active')}>
          {busy ? 'Adding…' : 'Add food item'}
        </button>
        <button className="button ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function FoodTypeField({ value, onChange }) {
  const groupId = useId();
  return (
    <fieldset className="food-type-field">
      <legend>Food type</legend>
      <label className={`food-type-choice veg-choice${value ? ' selected' : ''}`}>
        <input type="radio" name={`food-type-${groupId}`} checked={value} onChange={() => onChange(true)} />
        Veg
      </label>
      <label className={`food-type-choice non-veg-choice${!value ? ' selected' : ''}`}>
        <input type="radio" name={`food-type-${groupId}`} checked={!value} onChange={() => onChange(false)} />
        Non-Veg
      </label>
    </fieldset>
  );
}

function FoodManagementRow({ food, categories, onFoodUpdate, onFoodDelete, onPricesChange, onImageUpload }) {
  const [price, setPrice] = useState(String(food.price));
  const [discountPrice, setDiscountPrice] = useState(String(food.discountPrice || 0));
  const [details, setDetails] = useState({
    name: food.name,
    description: food.description || '',
    categoryId: String(food.categoryId),
    veg: Boolean(food.veg),
    preparationTime: String(food.preparationTime || 20),
    availability: food.availability || 'available',
    featured: Boolean(food.featured),
    stock: String(food.stock ?? 0),
    portionAmount: String(food.portionAmount ?? ''),
    portionUnit: food.portionUnit || 'g',
    ingredients: Array.isArray(food.ingredients) ? food.ingredients.join(', ') : (food.ingredients || '')
  });
  const [imageFile, setImageFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const savePrices = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await onPricesChange(food.id, {
        price: Number(price),
        discountPrice: Number(discountPrice || 0)
      });
      setMessage('Prices saved. The customer menu now shows the updated price.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async () => {
    if (!imageFile) {
      setError('Choose a JPEG, PNG, or WebP image first.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await onImageUpload(food.id, imageFile);
      setImageFile(null);
      setMessage('Image uploaded and applied to the menu.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await onFoodUpdate(food.id, {
        ...details,
        categoryId: Number(details.categoryId),
        preparationTime: Number(details.preparationTime),
        stock: Number(details.stock),
        ingredients: details.ingredients
      });
      setEditing(false);
      setMessage('Menu item updated on the customer website.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async () => {
    setBusy(true);
    setError('');
    try {
      await onFoodDelete(food.id);
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  };

  return (
    <article className="food-management-row">
      <img className="food-management-image" src={previewUrl || food.image} alt={food.name} />
      <div className="food-management-details">
        <strong>{food.name}</strong>
        <span>{food.categoryName || 'Menu item'}</span>
        <span className={`admin-food-type ${food.veg ? 'veg' : 'non-veg'}`}>{food.veg ? 'Veg' : 'Non-Veg'}</span>
        <span>{formatPortion(food) ? `Serving size: ${formatPortion(food)}` : 'Serving size not set'}</span>
        <button className="text-button edit-details-button" type="button" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Close details' : 'Edit details'}
        </button>
      </div>
      <form className="food-price-form" onSubmit={savePrices}>
        <label>
          <span>Regular price</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            aria-label={`${food.name} regular price`}
            required
          />
        </label>
        <label>
          <span>Discount price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discountPrice}
            onChange={(event) => setDiscountPrice(event.target.value)}
            aria-label={`${food.name} discount price`}
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>Save prices</button>
      </form>
      <div className="food-image-controls">
        <label className="image-file-label">
          <span>{imageFile ? imageFile.name : 'Choose food image'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setImageFile(event.target.files?.[0] || null);
              setError('');
              setMessage('');
            }}
            aria-label={`Choose image for ${food.name}`}
          />
        </label>
        <button className="button secondary" type="button" onClick={uploadImage} disabled={busy || !imageFile}>
          {busy && imageFile ? 'Uploading…' : 'Upload image'}
        </button>
        <button className="text-button delete-item-button" type="button" onClick={deleteItem} disabled={busy}>
          Delete item
        </button>
      </div>
      {editing && (
        <form className="catalog-editor food-details-editor" onSubmit={saveDetails}>
          <div className="catalog-form-grid">
            <input value={details.name} onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))} placeholder="Food name" required />
            <select value={details.categoryId} onChange={(event) => setDetails((current) => ({ ...current, categoryId: event.target.value }))} required>
              {categories.filter((category) => category.status === 'active').map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <input value={details.preparationTime} type="number" min="1" onChange={(event) => setDetails((current) => ({ ...current, preparationTime: event.target.value }))} placeholder="Preparation minutes" required />
            <input value={details.stock} type="number" min="0" onChange={(event) => setDetails((current) => ({ ...current, stock: event.target.value }))} placeholder="Stock quantity" required />
            <label className="portion-size-input">
              <span>Serving size shown on menu</span>
              <input value={details.portionAmount} type="number" min="0.1" step="0.1" onChange={(event) => setDetails((current) => ({ ...current, portionAmount: event.target.value }))} placeholder="e.g. 500" />
              <select value={details.portionUnit} onChange={(event) => setDetails((current) => ({ ...current, portionUnit: event.target.value }))} aria-label={`${food.name} serving size unit`}>
                <option value="g">grams (g)</option>
                <option value="kg">kilograms (kg)</option>
              </select>
            </label>
          </div>
          <textarea value={details.description} onChange={(event) => setDetails((current) => ({ ...current, description: event.target.value }))} placeholder="Food description" rows="2" />
          <input value={details.ingredients} onChange={(event) => setDetails((current) => ({ ...current, ingredients: event.target.value }))} placeholder="Ingredients, separated by commas" />
          <div className="catalog-options">
            <FoodTypeField value={details.veg} onChange={(veg) => setDetails((current) => ({ ...current, veg }))} />
            <label className="checkbox-row"><input type="checkbox" checked={details.featured} onChange={(event) => setDetails((current) => ({ ...current, featured: event.target.checked }))} /> Show in Popular Items</label>
            <label className="checkbox-row"><input type="checkbox" checked={details.availability === 'available'} onChange={(event) => setDetails((current) => ({ ...current, availability: event.target.checked ? 'available' : 'out_of_stock' }))} /> Available to order</label>
          </div>
          <button className="button primary" type="submit" disabled={busy}>Save item details</button>
        </form>
      )}
      {(error || message) && (
        <p className={error ? 'food-management-feedback error-text' : 'food-management-feedback success-text'} role="status">
          {error || message}
        </p>
      )}
    </article>
  );
}

function CategoryManagementPanel({ categories, onCategoryCreate, onCategoryUpdate, onCategoryDelete, onImageUpload }) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <section className="food-management-panel category-management-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Homepage &amp; menu controls</p>
          <h3>Categories &amp; Featured Categories</h3>
        </div>
        <div className="admin-heading-actions">
          <span>{categories.length} categories</span>
          <button className="button primary" type="button" onClick={() => setIsAdding((value) => !value)}>
            {isAdding ? 'Close form' : 'Add category'}
          </button>
        </div>
      </div>
      <p className="category-management-help">
        Featured and active categories appear in the homepage category section. Edit each image to keep category tiles current.
      </p>
      {isAdding && (
        <AddCategoryForm
          onCreate={onCategoryCreate}
          onCancel={() => setIsAdding(false)}
        />
      )}
      <div className="category-management-list">
        {categories.map((category) => (
          <CategoryManagementRow
            key={category.id}
            category={category}
            onUpdate={onCategoryUpdate}
            onDelete={onCategoryDelete}
            onImageUpload={onImageUpload}
          />
        ))}
      </div>
    </section>
  );
}

function AddCategoryForm({ onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [featured, setFeatured] = useState(true);
  const [active, setActive] = useState(true);
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const submit = async (event) => {
    event.preventDefault();
    if (!image) {
      setError('Choose an image for the category.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({ name, featured, active }, image);
      onCancel();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="catalog-editor" onSubmit={submit}>
      <h4>Add a category</h4>
      <div className="category-create-controls">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" required />
        <label className="checkbox-row"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Feature on homepage</label>
        <label className="checkbox-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active in menu</label>
      </div>
      <div className="catalog-image-picker">
        {previewUrl && <img src={previewUrl} alt="New category image preview" />}
        <label className="image-file-label">
          <span>{image ? image.name : 'Choose category image (required)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="catalog-form-actions">
        <button className="button primary" type="submit" disabled={busy || !image}>{busy ? 'Adding…' : 'Add category'}</button>
        <button className="button ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CategoryManagementRow({ category, onUpdate, onDelete, onImageUpload }) {
  const [name, setName] = useState(category.name);
  const [featured, setFeatured] = useState(Boolean(category.featured));
  const [active, setActive] = useState(category.status === 'active');
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!image) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await onUpdate(category.id, { name, featured, active });
      setMessage('Category updated on the website.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!image) {
      setError('Choose a JPEG, PNG, or WebP image first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await onImageUpload(category.id, image);
      setImage(null);
      setMessage('Category image updated on the homepage.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete(category.id);
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  };

  return (
    <article className="category-management-row">
      {previewUrl || category.image
        ? <img className="category-management-image" src={previewUrl || category.image} alt={category.name} />
        : <div className="category-management-image category-management-image-placeholder" aria-label={`${category.name} image not uploaded`}>{category.name.charAt(0)}</div>}
      <form className="category-edit-fields" onSubmit={save}>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`${category.name} category name`} required />
        <div className="catalog-options">
          <label className="checkbox-row"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Featured</label>
          <label className="checkbox-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label>
        </div>
        <button className="button primary" type="submit" disabled={busy}>Save category</button>
      </form>
      <div className="category-image-controls">
        <label className="image-file-label">
          <span>{image ? image.name : 'Choose category image'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            setImage(event.target.files?.[0] || null);
            setError('');
            setMessage('');
          }} />
        </label>
        <button className="button secondary" type="button" onClick={upload} disabled={busy || !image}>Upload image</button>
        <button className="text-button delete-item-button" type="button" onClick={remove} disabled={busy}>Delete</button>
      </div>
      {(error || message) && (
        <p className={error ? 'food-management-feedback error-text' : 'food-management-feedback success-text'} role="status">
          {error || message}
        </p>
      )}
    </article>
  );
}

function CateringServiceManagementPanel({ services, onCreate, onUpdate, onDelete, onImageUpload }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="food-management-panel catering-management-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Events &amp; Catering</p>
          <h3>Catering Services</h3>
        </div>
        <div className="admin-heading-actions">
          <span>{services.length} services</span>
          <button className="button primary" type="button" onClick={() => setAdding((value) => !value)}>
            {adding ? 'Close form' : 'Add catering service'}
          </button>
        </div>
      </div>
      {adding && <CateringServiceForm onSubmit={onCreate} onCancel={() => setAdding(false)} />}
      <div className="category-management-list">
        {services.map((service) => (
          <CateringServiceRow
            key={service.id}
            service={service}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onImageUpload={onImageUpload}
          />
        ))}
        {!services.length && !adding && <p className="food-management-empty">No catering services. Add one to show it on the Events &amp; Catering page.</p>}
      </div>
    </section>
  );
}

function CateringServiceForm({ service, onSubmit, onCancel }) {
  const isEditing = Boolean(service);
  const [form, setForm] = useState({
    name: service?.name || '',
    description: service?.description || '',
    startingPrice: String(service?.startingPrice ?? 0),
    features: Array.isArray(service?.features) ? service.features.join(', ') : '',
    active: service ? service.status === 'active' : true
  });
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const submit = async (event) => {
    event.preventDefault();
    if (!service && !image) {
      setError('Choose a service image before adding it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        startingPrice: Number(form.startingPrice),
        features: form.features
      }, image);
      onCancel();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="catalog-editor" onSubmit={submit}>
      <h4>{isEditing ? `Edit ${service.name}` : 'Add a catering service'}</h4>
      <div className="catalog-form-grid catering-form-grid">
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Service name" required />
        <input type="number" min="0" step="0.01" value={form.startingPrice} onChange={(event) => setForm((current) => ({ ...current, startingPrice: event.target.value }))} placeholder="Internal starting price (not shown publicly)" aria-label="Internal starting price (not shown publicly)" required />
      </div>
      <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Service description" rows="2" required />
      <input value={form.features} onChange={(event) => setForm((current) => ({ ...current, features: event.target.value }))} placeholder="Features, separated by commas" />
      <label className="checkbox-row catering-active-toggle">
        <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
        Show on Events &amp; Catering page
      </label>
      <div className="catalog-image-picker">
        {previewUrl && <img src={previewUrl} alt="Catering service image preview" />}
        {service && !previewUrl && <img src={service.image} alt={service.name} />}
        <label className="image-file-label">
          <span>{image ? image.name : isEditing ? 'Choose new service image (optional)' : 'Choose service image (required)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="catalog-form-actions">
        <button className="button primary" type="submit" disabled={busy || (!isEditing && !image)}>
          {busy ? 'Saving…' : isEditing ? 'Save service' : 'Add service'}
        </button>
        <button className="button ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CateringServiceRow({ service, onUpdate, onDelete, onImageUpload }) {
  const [editing, setEditing] = useState(false);
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!image) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  const updateService = async (payload, image) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await onUpdate(service.id, payload);
      if (image) await onImageUpload(service.id, image);
      setMessage('Catering service updated on the website.');
      setEditing(false);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async () => {
    if (!image) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await onImageUpload(service.id, image);
      setImage(null);
      setMessage('Catering image updated on the website.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete(service.id);
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  };

  return (
    <article className="category-management-row catering-service-row">
      <img className="category-management-image" src={previewUrl || service.image} alt={service.name} />
      <div className="catering-service-details">
        <strong>{service.name}</strong>
        <span>{service.description}</span>
        <span>{service.features.join(' · ')}</span>
        <span className={service.status === 'active' ? 'service-active' : 'service-inactive'}>
          {service.status === 'active' ? 'Visible on website' : 'Hidden from website'}
        </span>
      </div>
      <div className="category-image-controls">
        <button className="button secondary" type="button" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Close editor' : 'Edit service'}
        </button>
        <label className="image-file-label">
          <span>{image ? image.name : 'Choose new image'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            setImage(event.target.files?.[0] || null);
            setError('');
            setMessage('');
          }} />
        </label>
        <button className="button secondary" type="button" disabled={busy || !image} onClick={uploadImage}>Upload image</button>
        <button className="text-button delete-item-button" type="button" disabled={busy} onClick={remove}>Remove</button>
      </div>
      {editing && (
        <CateringServiceForm
          service={service}
          onSubmit={updateService}
          onCancel={() => setEditing(false)}
        />
      )}
      {(error || message) && (
        <p className={error ? 'food-management-feedback error-text' : 'food-management-feedback success-text'} role="status">
          {error || message}
        </p>
      )}
    </article>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-content">
        <div className="footer-brand">
          <Link to="/" className="footer-logo">
            <img src="/assets/cloud-kitchen-logo.jpg" alt="Cloud Kitchen" />
          </Link>
          <div>
            <p>AS Cloud Kitchen Official © 2026</p>
            <a href="tel:8333948189">8333948189</a>
            <a href="mailto:ascloudkitchenofficial@gmail.com">ascloudkitchenofficial@gmail.com</a>
            <span>Guntur, Andhra Pradesh</span>
          </div>
        </div>
        <div className="footer-links">
          <Link to="/menu">Menu</Link>
          <Link to="/events">Events</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

export default App;
