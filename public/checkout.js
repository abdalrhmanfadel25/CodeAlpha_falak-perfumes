const API_BASE_URL = ''; // Same origin
const SHIPPING_COST = 70;
let authToken = null;
let currentUser = null;

// --- CART COUNTDOWN TIMER ---
const CART_TIMER_DURATION = 5 * 60; // 5 minutes in seconds
let cartTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // Setup event listeners and initial state
    initializeCheckoutPage();
    
    // Load data from local storage
    loadAuthFromLocalStorage();
    loadCartAndDisplaySummary();
    loadSavedInfo();

    // Populate dynamic fields
    populateGovernorates();
    
    // Pre-fill fields if user is logged in
    if (currentUser) {
        document.getElementById('email').value = currentUser.email;
        // You can pre-fill other fields here if you store them
    }

    // Cart timer on load
    const cart = JSON.parse(localStorage.getItem('falakCart')) || [];
    if (cart.length > 0 && localStorage.getItem('falakCartTimerStart')) {
        startCartTimer();
    } else {
        resetCartTimer();
    }
});

function initializeCheckoutPage() {
    // Form submission
    const form = document.getElementById('checkoutForm');
    form.addEventListener('submit', handleCheckout);

    // Mobile summary toggling
    const summaryHeader = document.getElementById('summaryMobileHeader');
    summaryHeader.addEventListener('click', toggleSummary);

    // Billing address toggling
    document.querySelectorAll('input[name="billing"]').forEach(radio => {
        radio.addEventListener('change', toggleBillingForm);
    });

    // Promo code buttons
    const promoBtn = document.getElementById('applyPromoBtn');
    if(promoBtn) promoBtn.addEventListener('click', applyPromoCode);
    
    const promoBtnBottom = document.getElementById('applyPromoBtnBottom');
    if(promoBtnBottom) promoBtnBottom.addEventListener('click', applyPromoCode);
}

function toggleSummary() {
    const summaryHeader = document.getElementById('summaryMobileHeader');
    const summaryContent = document.getElementById('summaryContent');
    summaryHeader.classList.toggle('open');
    summaryContent.classList.toggle('open');
}

function toggleBillingForm(event) {
    const billingForm = document.getElementById('billingAddressForm');
    if (event.target.value === 'different') {
        billingForm.classList.remove('hidden');
    } else {
        billingForm.classList.add('hidden');
    }
}

function loadAuthFromLocalStorage() {
    authToken = localStorage.getItem('falakAuthToken');
    const userJson = localStorage.getItem('falakUser');
    if (userJson) {
        currentUser = JSON.parse(userJson);
    }
}

function loadSavedInfo() {
    const savedInfo = localStorage.getItem('falakCheckoutInfo');
    if (savedInfo) {
        const info = JSON.parse(savedInfo);
        document.getElementById('email').value = info.email || '';
        document.getElementById('firstName').value = info.firstName || '';
        document.getElementById('lastName').value = info.lastName || '';
        document.getElementById('address').value = info.address || '';
        document.getElementById('area').value = info.area || '';
        document.getElementById('phone').value = info.phone || '';
        document.getElementById('governorate').value = info.governorate || '';
        document.getElementById('saveInfo').checked = true;
    }
}

function saveInfo() {
    const info = {
        email: document.getElementById('email').value,
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        address: document.getElementById('address').value,
        area: document.getElementById('area').value,
        phone: document.getElementById('phone').value,
        governorate: document.getElementById('governorate').value,
    };
    localStorage.setItem('falakCheckoutInfo', JSON.stringify(info));
}

function loadCartAndDisplaySummary() {
    const cart = JSON.parse(localStorage.getItem('falakCart')) || [];
    const summaryItems = document.getElementById('summaryItems');
    const summaryItemsBottom = document.getElementById('summaryItemsBottom');
    const emptyCartHTML = '<p>Your cart is empty.</p>';
    if (cart.length === 0) {
        if (summaryItems) summaryItems.innerHTML = emptyCartHTML;
        if (summaryItemsBottom) summaryItemsBottom.innerHTML = emptyCartHTML;
        resetCartTimer();
        updateTotals(cart);
        updateCartTimerUI();
        return;
    }
    const cartHTML = cart.map(item => `
        <div class="summary-item">
            <div class="item-image">
                <i class="${item.icon || 'fas fa-star'}"></i>
                <span class="item-quantity">${item.quantity}</span>
            </div>
            <div class="item-details">
                <h3>${item.name}</h3>
                <span>Price: EGP ${item.price.toFixed(2)}</span>
            </div>
            <span class="item-price">EGP ${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
    if (summaryItems) summaryItems.innerHTML = cartHTML;
    if (summaryItemsBottom) summaryItemsBottom.innerHTML = cartHTML;
    updateTotals(cart);
    updateCartTimerUI();
    // Start timer if not already started
    if (cart.length > 0 && !localStorage.getItem('falakCartTimerStart')) {
        startCartTimer();
    }
}

function updateTotals(cart) {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + SHIPPING_COST;

    const subtotalText = `EGP ${subtotal.toFixed(2)}`;
    const shippingText = `EGP ${SHIPPING_COST.toFixed(2)}`;
    const totalText = `EGP ${total.toFixed(2)}`;

    // Top/Side summary
    document.getElementById('summarySubtotal').textContent = subtotalText;
    document.getElementById('summaryShipping').textContent = shippingText;
    document.getElementById('summaryTotal').textContent = totalText;
    document.getElementById('summaryMobileTotal').textContent = totalText;

    // Bottom summary
    const summarySubtotalBottom = document.getElementById('summarySubtotalBottom');
    if (summarySubtotalBottom) summarySubtotalBottom.textContent = subtotalText;
    
    const summaryShippingBottom = document.getElementById('summaryShippingBottom');
    if (summaryShippingBottom) summaryShippingBottom.textContent = shippingText;
    
    const summaryTotalBottom = document.getElementById('summaryTotalBottom');
    if (summaryTotalBottom) summaryTotalBottom.textContent = totalText;
}

function populateGovernorates() {
    const governorates = [
        "Alexandria", "Aswan", "Asyut", "Beheira", "Beni Suef", "Cairo", "Dakahlia", "Damietta", "Faiyum",
        "Gharbia", "Giza", "Ismailia", "Kafr El Sheikh", "Luxor", "Matruh", "Minya", "Monufia", "New Valley",
        "North Sinai", "Port Said", "Qalyubia", "Qena", "Red Sea", "Sharqia", "Sohag", "South Sinai", "Suez"
    ];
    const select = document.getElementById('governorate');
    const billingSelect = document.getElementById('billingGovernorate');

    governorates.forEach(gov => {
        const option = document.createElement('option');
        option.value = gov;
        option.textContent = gov;
        select.appendChild(option);
        billingSelect.appendChild(option.cloneNode(true));
    });
}

async function handleCheckout(event) {
    event.preventDefault();
    if (document.getElementById('saveInfo').checked) {
        saveInfo();
    } else {
        localStorage.removeItem('falakCheckoutInfo');
    }

    const cart = JSON.parse(localStorage.getItem('falakCart')) || [];

    if (cart.length === 0) {
        showMessage('Your cart is empty. Cannot proceed.', 'error');
        return;
    }

    const shippingAddress = {
        name: `${document.getElementById('firstName').value} ${document.getElementById('lastName').value}`,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        city: document.getElementById('governorate').value,
        area: document.getElementById('area').value,
        country: 'Egypt',
    };

    let billingAddress = shippingAddress;
    if (document.getElementById('diffAddress').checked) {
        billingAddress = {
            name: `${document.getElementById('billingFirstName').value} ${document.getElementById('billingLastName').value}`,
            address: document.getElementById('billingAddress').value,
            city: document.getElementById('billingGovernorate').value,
            country: 'Egypt',
        };
    }

    const orderData = {
        items: cart.map(item => ({
            product: item._id,
            quantity: item.quantity,
            price: item.price,
        })),
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) + SHIPPING_COST,
        shippingAddress,
        billingAddress
    };

    try {
        await apiRequest('/orders', 'POST', orderData);
        localStorage.removeItem('falakCart');
        showMessage('Order placed successfully! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 2000);
    } catch (error) {
        console.error('Checkout failed:', error);
    }
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, config);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Something went wrong');
        }
        return response.json();
    } catch (error) {
        showMessage(error.message, 'error');
        throw error;
    } finally {
        hideLoading();
    }
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.classList.add('show');
    setTimeout(() => {
        messageEl.classList.remove('show');
    }, 3000);
}

function showLoading() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';
}

function hideLoading() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
}

function applyPromoCode() {
    // This is a placeholder. You can add real promo code logic here.
    const promoCodeInput = document.getElementById('promoCode').value;
    const promoCodeBottomInput = document.getElementById('promoCodeBottom').value;
    
    if (promoCodeInput || promoCodeBottomInput) {
        showMessage('Promo code applied!', 'success');
    } else {
        showMessage('Please enter a promo code.', 'error');
    }
}

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
    const timerEl = document.getElementById('cartTimerCheckout');
    const timerElBottom = document.getElementById('cartTimerCheckoutBottom');
    const cart = JSON.parse(localStorage.getItem('falakCart')) || [];
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
        }
    }
    if (timerElBottom) {
        if (remaining > 0 && cart.length > 0) {
            const min = Math.floor(remaining / 60).toString().padStart(2, '0');
            const sec = (remaining % 60).toString().padStart(2, '0');
            timerElBottom.textContent = `Cart reserved: ${min}:${sec}`;
            timerElBottom.style.display = 'block';
        } else {
            timerElBottom.textContent = '';
            timerElBottom.style.display = 'none';
        }
    }
    if (remaining === 0 && cart.length > 0) {
        localStorage.removeItem('falakCart');
        resetCartTimer();
        loadCartAndDisplaySummary();
        showMessage('Cart reservation expired.', 'error');
    }
} 