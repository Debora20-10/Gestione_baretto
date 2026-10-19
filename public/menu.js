const productImages = {
  'caffe espresso': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80',
  cappuccino: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=900&q=80',
  cornetto: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=80',
  'brioche alla crema': 'https://images.unsplash.com/photo-1530610476181-d83430b64dcd?auto=format&fit=crop&w=900&q=80',
  'spremuta arancia': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=80',
  'panino prosciutto e formaggio': 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=900&q=80',
  'toast prosciutto e formaggio': 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80',
  'focaccia farcita': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
  'acqua naturale': 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80',
  'te caldo': 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=900&q=80',
  'bibita cola': '/nascita-coca-cola.jpg',
  'te freddo al limone': 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80',
  'pasta al pomodoro': '/Pasta-Pomodoro-009.jpg',
  'insalata caprese': 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
  'lasagna al ragu': 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=900&q=80',
  'pizza margherita': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
  'bibita pepsi': 'https://i.pinimg.com/originals/a8/69/36/a8693623d82be6fe34809d27eb6a8ee7.jpg?nii=t'
};
const menuGrid = document.querySelector('#menuGrid');
const categoryFilters = document.querySelector('#categoryFilters');
const menuMessage = document.querySelector('#menuMessage');
const cartList = document.querySelector('#cartList');
const cartEmpty = document.querySelector('#cartEmpty');
const cartTotal = document.querySelector('#cartTotal');
const cartCount = document.querySelector('#cartCount');
const cartSummaryCount = document.querySelector('#cartSummaryCount');
const checkoutForm = document.querySelector('#checkoutForm');
const checkoutButton = document.querySelector('#checkoutButton');
const checkoutFeedback = document.querySelector('#checkoutFeedback');
const orderConfirmation = document.querySelector('#orderConfirmation');
const confirmationDetails = document.querySelector('#confirmationDetails');
const cart = new Map();
let products = [];
let selectedCategory = 'Tutti';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatPrice(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

function imageFor(product) {
  const normalizedName = product.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return productImages[normalizedName] || '';
}

function renderCategories() {
  const categories = ['Tutti', ...new Set(products.map((product) => product.categoria || 'Generica'))];
  categoryFilters.innerHTML = categories.map((category) => `
    <button class="category-filter ${category === selectedCategory ? 'is-selected' : ''}"
      type="button" data-category="${escapeHtml(category)}"
      aria-pressed="${category === selectedCategory}">${escapeHtml(category)}</button>
  `).join('');
}

function renderProducts() {
  const visibleProducts = selectedCategory === 'Tutti'
    ? products
    : products.filter((product) => (product.categoria || 'Generica') === selectedCategory);
  document.querySelector('#productCount').textContent = `${visibleProducts.length} prodotti`;
  menuGrid.innerHTML = visibleProducts.map((product) => {
    const image = imageFor(product);
    return `
      <article class="menu-card">
        ${image ? `<img class="menu-card-image" src="${image}" alt="${escapeHtml(product.nome)}"
          loading="lazy" onerror="this.hidden=true" />` : ''}
        <div class="menu-card-content">
          <p class="menu-card-category">${escapeHtml(product.categoria || 'Generica')}</p>
          <h3>${escapeHtml(product.nome)}</h3>
          <p class="menu-card-description">${escapeHtml(product.descrizione || '')}</p>
          <div class="menu-card-footer">
            <strong>${formatPrice(Number(product.prezzo))}</strong>
            <button class="add-to-cart" type="button" data-add="${product.id}"
              aria-label="Aggiungi ${escapeHtml(product.nome)} al carrello">Aggiungi</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderCart() {
  const itemCount = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  const total = [...cart.entries()].reduce((sum, [productId, quantity]) => {
    const product = products.find((item) => Number(item.id) === Number(productId));
    return sum + (product ? Number(product.prezzo) * quantity : 0);
  }, 0);
  cartCount.textContent = itemCount;
  cartSummaryCount.textContent = `${itemCount} ${itemCount === 1 ? 'articolo' : 'articoli'}`;
  cartEmpty.hidden = itemCount > 0;
  cartList.innerHTML = [...cart.entries()].map(([productId, quantity]) => {
    const product = products.find((item) => Number(item.id) === Number(productId));
    if (!product) return '';
    return `
      <li class="cart-item">
        <div class="cart-item-details">
          <strong>${escapeHtml(product.nome)}</strong>
          <span>${formatPrice(Number(product.prezzo) * quantity)}</span>
        </div>
        <div class="quantity-control" aria-label="Quantità ${escapeHtml(product.nome)}">
          <button type="button" data-quantity="-1" data-product="${product.id}"
            aria-label="Diminuisci quantità di ${escapeHtml(product.nome)}">−</button>
          <span>${quantity}</span>
          <button type="button" data-quantity="1" data-product="${product.id}"
            aria-label="Aumenta quantità di ${escapeHtml(product.nome)}" ${quantity >= 20 ? 'disabled' : ''}>+</button>
        </div>
      </li>
    `;
  }).join('');
  cartTotal.textContent = formatPrice(total);
  checkoutButton.disabled = itemCount === 0;
  checkoutButton.textContent = itemCount ? `Conferma ordine · ${formatPrice(total)}` : 'Conferma ordine';
}

async function loadMenu() {
  try {
    const response = await fetch('/api/public/prodotti');
    if (!response.ok) throw new Error('Menu temporaneamente non disponibile.');
    products = await response.json();
    renderCategories();
    renderProducts();
    renderCart();
    if (products.length === 0) {
      menuMessage.textContent = 'Al momento non ci sono prodotti disponibili.';
      menuMessage.hidden = false;
    }
  } catch (error) {
    menuMessage.textContent = error.message || 'Impossibile caricare il menu.';
    menuMessage.hidden = false;
  }
}

categoryFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderCategories();
  renderProducts();
});

menuGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  const productId = Number(button.dataset.add);
  if ((cart.get(productId) || 0) >= 20) return;
  cart.set(productId, (cart.get(productId) || 0) + 1);
  checkoutFeedback.textContent = '';
  orderConfirmation.hidden = true;
  renderCart();
});

cartList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-quantity]');
  if (!button) return;
  const productId = Number(button.dataset.product);
  const nextQuantity = (cart.get(productId) || 0) + Number(button.dataset.quantity);
  if (nextQuantity > 20) return;
  if (nextQuantity > 0) cart.set(productId, nextQuantity);
  else cart.delete(productId);
  orderConfirmation.hidden = true;
  renderCart();
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (cart.size === 0) return;
  checkoutButton.disabled = true;
  checkoutFeedback.textContent = '';

  try {
    const response = await fetch('/api/public/ordini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: checkoutForm.elements.paymentMethod.value,
        items: [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity })),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Impossibile completare l’ordine.');

    const orderTotal = formatPrice(result.total);
    confirmationDetails.textContent = `Numer${result.orderIds.length === 1 ? 'o' : 'i'} ordine ${result.orderIds.map((id) => `#${id}`).join(', ')} · ${orderTotal}`;
    orderConfirmation.hidden = false;
    cart.clear();
    renderCart();
  } catch (error) {
    checkoutFeedback.textContent = error.message || 'Impossibile contattare il server.';
    checkoutButton.disabled = false;
  }
});

loadMenu();
