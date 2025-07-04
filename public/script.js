// Initialize AOS
AOS.init({
    duration: 1000,
    once: true
});

const API_BASE_URL = ''; // The backend is on the same origin

// --- STATE MANAGEMENT ---
let allProducts = [];
let cart = [];
let currentUser = null;
let authToken = null;

// --- API HELPER ---
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const config = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, config);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Something went wrong');
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return { success: true };
        }
    } catch (error) {
        console.error(`API Error on ${method} ${endpoint}:`, error);
        showMessage(error.message, 'error');
        throw error;
    } finally {
        hideLoading();
    }
}

// --- PRODUCT MANAGEMENT ---
function displayProducts(productsToDisplay, gridId) {
    const productsGrid = document.getElementById(gridId);
    if (!productsGrid) {
        console.error(`Element with ID ${gridId} not found.`);
        return;
    }
    if (productsToDisplay.length === 0) {
        productsGrid.innerHTML = `<p style="text-align:center; color: var(--color-text); grid-column: 1 / -1;">No products found in this collection yet.</p>`;
        return;
    }
    productsGrid.innerHTML = productsToDisplay.map(product => `
        <div class="product-card" data-aos="fade-up" data-aos-delay="100">
            <div class="product-image">
                ${product.image
                    ? `<img src="${product.image}" alt="${product.name}" class="product-item-image">`
                    : `<i class="${product.icon || 'fas fa-star'}"></i>`
                }
                ${product.discountPercentage > 0 ? `<div class="discount-badge">-${product.discountPercentage}%</div>` : ''}
            </div>
            <div class="product-category">${product.category}</div>
            <h3 class="product-title">${product.name}</h3>
            <div class="product-price-container">
                ${product.originalPrice && product.originalPrice > product.price ? `<p class="product-price-original">EGP ${product.originalPrice}</p>` : ''}
                <p class="product-price">EGP ${product.price}</p>
            </div>
            <div class="product-card-buttons">
                <button class="details-btn" onclick="showProductDetails('${product._id}')">Details</button>
                <button class="add-to-cart" onclick="addToCart('${product._id}')">
                    Add to Cart <i class="fas fa-shopping-cart"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function fetchAndDisplayProducts() {
    try {
        const trendingProducts = await apiRequest('/products?subcategory=trending');
        displayProducts(trendingProducts, 'trendingGrid');

        const bestsellingProducts = await apiRequest('/products?subcategory=bestselling');
        displayProducts(bestsellingProducts, 'bestsellingGrid');
        
        const all = await apiRequest('/products');
        allProducts = all;

    } catch (error) {
        console.error('Failed to fetch products:', error);
    }
}

function showProductDetails(productId) {
    const product = allProducts.find(p => p._id === productId);
    if (!product) return;

    const modal = document.getElementById('product-modal');
    const modalBody = document.getElementById('modal-body');

    modalBody.innerHTML = `
        <img src="${product.image || 'assets/placeholder.jpg'}" alt="${product.name}" class="modal-product-image">
        <div class="modal-product-details">
            <h2>${product.name}</h2>
            <p class="modal-product-price">EGP ${product.price}</p>
            <p>${product.description}</p>
            <button class="add-to-cart-modal" onclick="addToCart('${product._id}'); closeProductDetails();">
                Add to Cart <i class="fas fa-shopping-cart"></i>
            </button>
        </div>
    `;

    modal.classList.add('active');
}

function closeProductDetails() {
    const modal = document.getElementById('product-modal');
    modal.classList.remove('active');
}


// --- CART MANAGEMENT ---
function addToCart(productId) {
    const product = allProducts.find(p => p._id === productId);
    if (!product) return;
    const existingItem = cart.find(item => item._id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
        if (!localStorage.getItem('falakCartTimerStart')) {
            startCartTimer();
        }
    }
    updateCartUI();
    saveCartToLocalStorage();
    showMessage(`${product.name} added to cart!`, 'success');
}

function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    const cartTimerEl = document.getElementById('cartTimer');
    if (!cartCount || !cartItems || !cartTotalEl) return;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    if (totalItems === 0) {
        cartItems.innerHTML = '<p style="text-align:center; opacity: 0.7;">Your cart is empty.</p>';
        resetCartTimer();
    } else {
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div>
                    <h4>${item.name}</h4>
                    <p>EGP ${item.price} x ${item.quantity}</p>
                </div>
                <div>
                    <button onclick="changeQuantity('${item._id}', -1)" style="background: #ff6b6b; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; margin: 0 5px; cursor: pointer;">-</button>
                    <button onclick="changeQuantity('${item._id}', 1)" style="background: #4ecdc4; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; margin: 0 5px; cursor: pointer;">+</button>
                    <button onclick="removeFromCart('${item._id}')" style="background: #666; color: white; border: none; border-radius: 5px; padding: 5px 10px; margin-left: 10px; cursor: pointer;">Remove</button>
                </div>
            </div>
        `).join('');
    }
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotalEl.textContent = total.toFixed(2);
    updateCartTimerUI();
}

function changeQuantity(productId, change) {
    let item = cart.find(i => i._id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            updateCartUI();
            saveCartToLocalStorage();
        }
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item._id !== productId);
    updateCartUI();
    saveCartToLocalStorage();
    showMessage('Item removed from cart', 'success');
}

function toggleCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    cartSidebar.classList.toggle('open');
}

function saveCartToLocalStorage() {
    localStorage.setItem('falakCart', JSON.stringify(cart));
}

function loadCartFromLocalStorage() {
    const savedCart = localStorage.getItem('falakCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }
}

// --- ORDER MANAGEMENT ---
async function checkout() {
    if (cart.length === 0) {
        showMessage('Your cart is empty!', 'error');
        return;
    }
    
    window.location.href = '/checkout.html';
}

// --- AUTHENTICATION ---
function saveAuthToLocalStorage(token, user) {
    localStorage.setItem('falakAuthToken', token);
    localStorage.setItem('falakUser', JSON.stringify(user));
}

function loadAuthFromLocalStorage() {
    authToken = localStorage.getItem('falakAuthToken');
    const userJson = localStorage.getItem('falakUser');
    if (userJson) {
        currentUser = JSON.parse(userJson);
    }
}

function clearAuthFromLocalStorage() {
    localStorage.removeItem('falakAuthToken');
    localStorage.removeItem('falakUser');
    authToken = null;
    currentUser = null;
}

function updateNavForAuth() {
    const loginBtn = document.getElementById('navAuthBtn');
    if (!loginBtn) return;
    
    const navActions = loginBtn.parentElement;

    const existingAdminBtn = document.getElementById('adminDashboardBtn');
    if (existingAdminBtn) {
        existingAdminBtn.remove();
    }

    if (currentUser) {
        const firstName = currentUser.name.split(' ')[0];
        loginBtn.textContent = `Hello, ${firstName}`;
        loginBtn.onclick = () => {
            clearAuthFromLocalStorage();
            updateNavForAuth();
            showMessage('You have been logged out.', 'success');
        };

        if (currentUser.role === 'admin') {
            const adminBtn = document.createElement('button');
            adminBtn.id = 'adminDashboardBtn';
            adminBtn.textContent = 'Admin';
            adminBtn.className = 'cta-button nav-auth-btn';
            adminBtn.onclick = () => window.location.href = '/admin.html';
            navActions.insertBefore(adminBtn, loginBtn);
        }

    } else {
        loginBtn.textContent = 'Login';
        loginBtn.onclick = () => openModal('loginModal');
    }
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        const data = await apiRequest('/auth/login', 'POST', { email, password });
        authToken = data.token;
        currentUser = data.user;
        saveAuthToLocalStorage(authToken, currentUser);
        updateNavForAuth();
        closeModal('loginModal');
        showMessage('Welcome back!', 'success');
    } catch (error) {
        console.error('Login failed:', error);
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const data = await apiRequest('/auth/register', 'POST', { name, email, password });
        authToken = data.token;
        currentUser = data.user;
        saveAuthToLocalStorage(authToken, currentUser);
        updateNavForAuth();
        closeModal('registerModal');
        showMessage('Account created successfully!', 'success');
    } catch (error) {
        console.error('Registration failed:', error);
    }
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    try {
        const data = await apiRequest('/auth/forgot-password', 'POST', { email });
        closeModal('forgotPasswordModal');
        showMessage(data.message, 'success');
    } catch (error) {
        console.error('Forgot password request failed:', error);
    }
});


// --- MODAL & UI ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function switchToRegister() {
    closeModal('loginModal');
    openModal('registerModal');
}

function switchToLogin() {
    closeModal('registerModal');
    openModal('loginModal');
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.classList.add('show');
    if (messageEl._timeout) clearTimeout(messageEl._timeout);
    messageEl._timeout = setTimeout(() => {
        messageEl.classList.remove('show');
        messageEl.textContent = '';
    }, 3000);
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// --- EVENT LISTENERS & INITIALIZATION ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');

        if (targetId === '#trending' || targetId === '#bestselling') {
            showDefaultProductView();
        }

        const target = document.querySelector(targetId);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

window.addEventListener('click', function(e) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    const productModal = document.getElementById('product-modal');
    if (e.target == productModal) {
        closeProductDetails();
    }
});

const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
const mobileNavClose = document.getElementById('mobileNavClose');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

if (hamburger && mobileNav && mobileNavClose) {
    hamburger.addEventListener('click', () => {
        mobileNav.classList.add('open');
    });

    mobileNavClose.addEventListener('click', () => {
        mobileNav.classList.remove('open');
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileNav.classList.remove('open');
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    handleGoogleLogin();
    loadAuthFromLocalStorage();
    updateNavForAuth();
    loadCartFromLocalStorage();
    fetchAndDisplayProducts();
    fetchAndDisplayFeedback();
    updateCartUI();
    updateViewerCount();
    // Cart timer on load
    if (cart.length > 0 && localStorage.getItem('falakCartTimerStart')) {
        startCartTimer();
    } else {
        resetCartTimer();
    }
    
    setTimeout(() => {
        showMessage('Welcome to Falak - Discover cosmic fragrances!', 'success');
    }, 1000);
});

// --- FEEDBACK MANAGEMENT ---
function displayFeedback(feedbackList) {
    const feedbackGrid = document.getElementById('feedbackGrid');
    if (!feedbackGrid) return;
    if (feedbackList.length === 0) {
        feedbackGrid.innerHTML = `<p style="text-align:center; color: var(--color-text); grid-column: 1 / -1;">Be the first to leave a review!</p>`;
        return;
    }
    feedbackGrid.innerHTML = feedbackList.map((item, index) => `
        <div class="feedback-card" data-aos="fade-up" data-aos-delay="${index * 100}">
            <p class="comment">${item.comment}</p>
            <div class="feedback-author">
                <span class="name">- ${item.name}</span>
                <div class="rating">
                    ${[...Array(item.rating)].map(() => '<i class="fas fa-star"></i>').join('')}
                    ${[...Array(5 - item.rating)].map(() => '<i class="far fa-star"></i>').join('')}
                </div>
            </div>
        </div>
    `).join('');
}

async function fetchAndDisplayFeedback() {
    try {
        const feedback = await apiRequest('/feedback');
        displayFeedback(feedback);
    } catch (error) {
        console.error('Failed to fetch feedback:', error);
    }
}

// --- NEWSLETTER ---
document.getElementById('newsletterForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const email = emailInput.value;

    try {
        await apiRequest('/newsletter/subscribe', 'POST', { email });
        showMessage('Thank you for subscribing!', 'success');
        emailInput.value = '';
    } catch (error) {
        console.error('Subscription failed:', error);
    }
});

// --- CATEGORY VIEW TOGGLING ---
async function showCategoryProducts(category) {
    try {
        const products = await apiRequest(`/products?category=${category}`);
        const filteredSection = document.getElementById('filtered-products');
        const trendingSection = document.getElementById('trending');
        const bestsellingSection = document.getElementById('bestselling');
        const filteredTitle = document.getElementById('filtered-title');

        filteredTitle.textContent = category === 'men' ? "Fragrances for Him" : "Fragrances for Her";
        displayProducts(products, 'filteredGrid');

        trendingSection.style.display = 'none';
        bestsellingSection.style.display = 'none';
        filteredSection.style.display = 'block';

        filteredSection.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error(`Failed to fetch ${category} products:`, error);
    }
}

function showDefaultProductView() {
    const filteredSection = document.getElementById('filtered-products');
    const trendingSection = document.getElementById('trending');
    const bestsellingSection = document.getElementById('bestselling');

    filteredSection.style.display = 'none';
    trendingSection.style.display = 'block';
    bestsellingSection.style.display = 'block';
}

// --- GOOGLE AUTH HANDLER ---
function handleGoogleLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userString = urlParams.get('user');

    if (token && userString) {
        try {
            const user = JSON.parse(decodeURIComponent(userString));
            authToken = token;
            currentUser = user;
            saveAuthToLocalStorage(token, user);
            updateNavForAuth();
            
            window.history.replaceState({}, document.title, window.location.pathname);
            
            showMessage(`Welcome, ${user.name}!`, 'success');
        } catch(e) {
            console.error('Failed to parse user data from URL', e);
        }
    }
}

// --- CART COUNTDOWN TIMER ---
const CART_TIMER_DURATION = 5 * 60; // 5 minutes in seconds
let cartTimerInterval = null;

function startCartTimer() {
    if (!localStorage.getItem('falakCartTimerStart')) {
        localStorage.setItem('falakCartTimerStart', Date.now().toString());
    }
    updateCartTimerUI();
    if (cartTimerInterval) clearInterval(cartTimerInterval);
    cartTimerInterval = setInterval(updateCartTimerUI, 1000);
}

function resetCartTimer() {
    localStorage.removeItem('falakCartTimerStart');
    if (cartTimerInterval) clearInterval(cartTimerInterval);
    updateCartTimerUI();
}

function getCartTimerRemaining() {
    const start = parseInt(localStorage.getItem('falakCartTimerStart'), 10);
    if (!start) return CART_TIMER_DURATION;
    const elapsed = Math.floor((Date.now() - start) / 1000);
    return Math.max(0, CART_TIMER_DURATION - elapsed);
}

function updateCartTimerUI() {
    const timerEl = document.getElementById('cartTimer');
    const remaining = getCartTimerRemaining();
    if (timerEl) {
        if (remaining > 0 && cart.length > 0) {
            const min = Math.floor(remaining / 60).toString().padStart(2, '0');
            const sec = (remaining % 60).toString().padStart(2, '0');
            timerEl.textContent = `Cart reserved: ${min}:${sec}`;
            timerEl.style.display = 'block';
        } else {
            timerEl.textContent = '';
            timerEl.style.display = 'none';
            if (remaining === 0) {
                cart = [];
                saveCartToLocalStorage();
                updateCartUI();
                resetCartTimer();
                showMessage('Cart reservation expired.', 'error');
            }
        }
    }
}

// --- VIEWER COUNT ---
function updateViewerCount() {
    const viewerEl = document.getElementById('viewerNumber');
    if (!viewerEl) return;
    const randomViewers = Math.floor(Math.random() * 19) + 2; // 2-20
    viewerEl.textContent = randomViewers;
    const nextUpdate = Math.floor(Math.random() * 20) + 10; // 10-30s
    setTimeout(updateViewerCount, nextUpdate * 1000);
}