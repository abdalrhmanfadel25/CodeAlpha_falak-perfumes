// admin.js
const API_BASE_URL = '';
let authToken = null;
let currentUser = null;
let allOrders = [];

// --- UTILS ---
const showMessage = (text, type = 'info', title = '') => {
    const container = document.getElementById('notification-container');
    if (!container) {
        // Create the container if it doesn't exist
        const newContainer = document.createElement('div');
        newContainer.id = 'notification-container';
        document.body.appendChild(newContainer);
    }
    
    const notificationContainer = document.getElementById('notification-container');
    

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let iconClass = 'fa-info-circle';
    let defaultTitle = 'Info';

    switch (type) {
        case 'success':
            iconClass = 'fa-check-circle';
            defaultTitle = 'Success';
            break;
        case 'error':
            iconClass = 'fa-times-circle';
            defaultTitle = 'Error';
            break;
        case 'warning':
            iconClass = 'fa-exclamation-triangle';
            defaultTitle = 'Warning';
            break;
    }

    notification.innerHTML = `
        <div class="notification-header">
            <i class="fas ${iconClass}"></i>
            <span>${title || defaultTitle}</span>
        </div>
        <div class="notification-body">
            ${text}
        </div>
        <button class="close-notification">&times;</button>
    `;

    notificationContainer.appendChild(notification);

    const close = () => {
        notification.classList.add('fade-out');
        notification.addEventListener('animationend', () => {
            notification.remove();
        });
    };

    const timeoutId = setTimeout(close, 5000);

    notification.querySelector('.close-notification').addEventListener('click', () => {
        clearTimeout(timeoutId);
        close();
    });
};

const apiRequest = async (endpoint, method = 'GET', body = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, config);
        
        if (response.status === 401 || response.status === 403) {
            // Token is invalid or expired, or user is not an admin.
            // Clear auth data and redirect to login.
            localStorage.removeItem('falakAuthToken');
            localStorage.removeItem('falakUser');
            window.location.href = '/index.html';
            throw new Error('Authentication failed. Please log in again.');
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API request failed');
        return data;
    } catch (error) {
        showMessage(error.message, 'error');
        throw error;
    }
};

// --- AUTH ---
const checkAdminAuth = () => {
    authToken = localStorage.getItem('falakAuthToken');
    const userJson = localStorage.getItem('falakUser');
    if (!authToken || !userJson) {
        window.location.href = '/index.html';
        return;
    }
    currentUser = JSON.parse(userJson);
    if (currentUser.role !== 'admin') {
        showMessage('Access denied. Admin only.', 'error');
        window.location.href = '/index.html';
    }
};

// --- RENDER FUNCTIONS ---
const renderProducts = (products) => {
    const productList = document.getElementById('productList');
    if (products.length === 0) {
        productList.innerHTML = '<p>No products found.</p>';
        return;
    }
    productList.innerHTML = products.map(p => `
        <div class="product-item">
            ${p.image 
                ? `<img src="${p.image}" alt="${p.name}" class="product-item-image">`
                : `<div class="product-item-no-image"><i class="${p.icon || 'fas fa-box'}"></i></div>`
            }
            <div class="product-item-details">
                <h4>${p.name}</h4>
                <p>${p.category} / ${p.subcategory}</p>
                <p class="price">EGP ${p.price}</p>
            </div>
            <div class="item-actions">
                <button class="edit-btn" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="delete-btn" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>
    `).join('');
};

const renderOrders = (orders) => {
    // Clear existing columns
    const columns = document.querySelectorAll('.column-body');
    columns.forEach(col => col.innerHTML = '');

    orders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.draggable = true;
        orderCard.dataset.orderId = order._id;
        orderCard.innerHTML = `
            <div class="order-header">
                <h4 class="order-number">${order.orderNumber || 'N/A'}</h4>
                <span class="order-date">${new Date(order.createdAt).toLocaleDateString()}</span>
            </div>
            <p class="customer-email">${order.user ? order.user.email : (order.shippingAddress.email || 'Guest')}</p>
            <p>Items: ${order.items.reduce((sum, item) => sum + item.quantity, 0)}</p>
            <p class="order-total">EGP ${order.total.toFixed(2)}</p>
            <div class="notification-status">
                ${order.notifications?.emailSent ? '<span class="status-badge email-sent" title="Email sent">📧</span>' : ''}
                ${order.notifications?.whatsappSent ? '<span class="status-badge whatsapp-sent" title="WhatsApp sent">📱</span>' : ''}
                ${order.notifications?.adminNotified ? '<span class="status-badge admin-notified" title="Admin notified">🔔</span>' : ''}
            </div>
            <div class="order-status-changer">
                <select class="status-select" data-order-id="${order._id}">
                    <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In Process" ${order.status === 'In Process' ? 'selected' : ''}>In Process</option>
                    <option value="Completed" ${order.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
            <div class="order-actions">
                <button class="details-btn" onclick="showOrderDetails('${order._id}')">
                    <i class="fas fa-info-circle"></i> Details
                </button>
                <button class="delete-order-btn" onclick="deleteOrder('${order._id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;

        let containerId;
        if (order.status === 'In Process') containerId = 'orders-in-process';
        else if (order.status === 'Completed') containerId = 'orders-completed';
        else containerId = 'orders-pending';

        document.getElementById(containerId)?.appendChild(orderCard);
    });

    setupDragAndDrop();
    setupStatusChangers();
};

const renderRecentOrders = (orders) => {
    const list = document.getElementById('recentOrdersList');
    const recent = orders.slice(0, 5); // Get latest 5
    if (recent.length === 0) {
        list.innerHTML = '<p style="text-align: center; opacity: 0.7;">No recent orders.</p>';
        return;
    }
    list.innerHTML = recent.map(o => `
        <div class="recent-order-item">
            <div class="recent-order-info">
                <span class="order-number">${o.orderNumber || 'N/A'}</span>
                <span>${o.user ? o.user.email : (o.shippingAddress.email || 'Guest')}</span>
            </div>
            <div class="recent-order-status">
                <span class="status-${o.status.toLowerCase()}">${o.status}</span>
                <span class="price">EGP ${o.total.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
};

const renderStats = (stats) => {
    document.getElementById('totalUsers').textContent = stats.totalUsers;
    document.getElementById('newUsersLast30Days').textContent = stats.newUsersLast30Days;
    document.getElementById('totalProducts').textContent = stats.totalProducts;
    document.getElementById('totalOrders').textContent = stats.totalOrders;
    document.getElementById('totalRevenue').textContent = `EGP ${stats.totalRevenue.toFixed(2)}`;
    document.getElementById('averageOrderValue').textContent = `EGP ${stats.averageOrderValue.toFixed(2)}`;
};

// --- DATA FETCHING ---
const loadDashboardData = async () => {
    try {
        const [stats, products, orders] = await Promise.all([
            apiRequest('/admin/stats'),
            apiRequest('/products'),
            apiRequest('/admin/orders')
        ]);
        allOrders = orders;
        renderStats(stats);
        renderProducts(products);
        renderOrders(orders);
        renderRecentOrders(orders);
    } catch (error) {
        showMessage('Failed to load dashboard data.', 'error');
    }
};

// --- EVENT HANDLERS ---
const handleProductForm = async (e) => {
    e.preventDefault();
    const productId = document.getElementById('productId').value;
    const isEditing = !!productId;

    const imageInput = document.getElementById('image');
    imageInput.value = document.getElementById('imageUpload').value ? imageInput.value : '';

    const productData = {
        name: document.getElementById('name').value,
        price: document.getElementById('price').value,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        subcategory: document.getElementById('subcategory').value,
        icon: document.getElementById('icon').value,
        image: imageInput.value,
        adminDiscount: document.getElementById('adminDiscount').value || 0,
    };

    try {
        const endpoint = isEditing ? `/products/${productId}` : '/products';
        const method = isEditing ? 'PUT' : 'POST';
        await apiRequest(endpoint, method, productData);
        showMessage(`Product ${isEditing ? 'updated' : 'added'} successfully!`, 'success');
        resetProductForm();
        loadDashboardData();
    } catch (error) {
        showMessage(`Failed to ${isEditing ? 'update' : 'add'} product.`, 'error');
    }
};

const resetProductForm = () => {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('formTitle').textContent = 'Add New Product';
    document.getElementById('formSubmitBtn').textContent = 'Add Product';
    document.getElementById('formCancelBtn').style.display = 'none';
    
    // Clear file input and preview
    document.getElementById('imageUpload').value = '';
    document.getElementById('imagePreview').innerHTML = '';
};

window.editProduct = async (id) => {
    try {
        const product = await apiRequest(`/products/${id}`);
        document.getElementById('productId').value = product._id;
        document.getElementById('name').value = product.name;
        document.getElementById('price').value = product.price;
        document.getElementById('description').value = product.description;
        document.getElementById('category').value = product.category;
        document.getElementById('subcategory').value = product.subcategory;
        document.getElementById('icon').value = product.icon;
        document.getElementById('adminDiscount').value = product.adminDiscount || 0;
        
        const imageInput = document.getElementById('image');
        const imagePreview = document.getElementById('imagePreview');
        imageInput.value = product.image || '';
        imagePreview.innerHTML = product.image ? `<img src="${product.image}" alt="Image preview">` : '';

        document.getElementById('formTitle').textContent = 'Edit Product';
        document.getElementById('formSubmitBtn').textContent = 'Update Product';
        document.getElementById('formCancelBtn').style.display = 'inline-block';
        
        document.querySelector('.product-form-container').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showMessage('Could not fetch product details.', 'error');
    }
};

window.deleteProduct = async (id) => {
    if (confirm('Are you sure you want to delete this product?')) {
        try {
            await apiRequest(`/products/${id}`, 'DELETE');
            showMessage('Product deleted successfully!', 'success');
            loadDashboardData();
        } catch (error) {
            showMessage('Failed to delete product.', 'error');
        }
    }
};

window.deleteOrder = async (id) => {
    if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
        try {
            await apiRequest(`/orders/${id}`, 'DELETE');
            showMessage('Order deleted successfully!', 'success');
            loadDashboardData();
        } catch (error) {
            showMessage('Failed to delete order.', 'error');
        }
    }
};

const setupNavigation = () => {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const pages = document.querySelectorAll('.main-content .page');
    const mainHeaderTitle = document.querySelector('.main-header h2');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');

            // Only prevent default and handle in-page navigation for hash links
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);

                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                pages.forEach(p => p.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');
                
                mainHeaderTitle.textContent = item.textContent;

                // Close sidebar on mobile after navigation
                if (window.innerWidth <= 768) {
                    document.getElementById('admin-container').classList.remove('sidebar-open');
                }
            }
            // For full hrefs like "/index.html", the default browser action is allowed to happen
        });
    });
};

const setupMobileMenu = () => {
    const hamburger = document.getElementById('hamburger');
    const container = document.getElementById('admin-container');
    
    hamburger.addEventListener('click', () => {
        container.classList.toggle('sidebar-open');
    });
    
    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (container.classList.contains('sidebar-open')) {
            // Check if click is outside sidebar and not on hamburger
            const sidebar = document.querySelector('.sidebar');
            const isClickInsideSidebar = sidebar && sidebar.contains(e.target);
            const isClickOnHamburger = hamburger && hamburger.contains(e.target);
            
            if (!isClickInsideSidebar && !isClickOnHamburger) {
                container.classList.remove('sidebar-open');
            }
        }
    });
    
    // Close sidebar on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && container.classList.contains('sidebar-open')) {
            container.classList.remove('sidebar-open');
        }
    });
    
    // Handle touch events for better mobile experience
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    const handleSwipe = () => {
        const swipeThreshold = 50;
        const swipeDistance = touchEndX - touchStartX;
        
        // Swipe right to open sidebar (only if sidebar is closed)
        if (swipeDistance > swipeThreshold && !container.classList.contains('sidebar-open')) {
            container.classList.add('sidebar-open');
        }
        // Swipe left to close sidebar (only if sidebar is open)
        else if (swipeDistance < -swipeThreshold && container.classList.contains('sidebar-open')) {
            container.classList.remove('sidebar-open');
        }
    };
    
    // Prevent body scroll when sidebar is open on mobile
    const preventBodyScroll = () => {
        if (window.innerWidth <= 768) {
            if (container.classList.contains('sidebar-open')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    };
    
    // Observe sidebar state changes
    const observer = new MutationObserver(preventBodyScroll);
    observer.observe(container, { attributes: true, attributeFilter: ['class'] });
    
    // Initial check
    preventBodyScroll();
};

const setupDragAndDrop = () => {
    const cards = document.querySelectorAll('.order-card');
    const columns = document.querySelectorAll('.column-body');
    let draggedCard = null;

    cards.forEach(card => {
        card.addEventListener('dragstart', () => {
            draggedCard = card;
            setTimeout(() => card.classList.add('dragging'), 0);
        });

        card.addEventListener('dragend', () => {
            draggedCard.classList.remove('dragging');
            draggedCard = null;
        });
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => {
            e.preventDefault();
        });

        column.addEventListener('drop', async e => {
            e.preventDefault();
            if (!draggedCard) return;

            const orderId = draggedCard.dataset.orderId;
            const newStatus = column.dataset.status;

            try {
                await apiRequest(`/orders/${orderId}/status`, 'PATCH', { status: newStatus });
                column.appendChild(draggedCard);
                showMessage(`Order status updated to ${newStatus}`, 'success');
            } catch (error) {
                showMessage('Failed to update order status.', 'error');
            }
        });
    });
};

const setupStatusChangers = () => {
    const selects = document.querySelectorAll('.status-select');
    selects.forEach(select => {
        select.addEventListener('change', async (e) => {
            const orderId = e.target.dataset.orderId;
            const newStatus = e.target.value;
            try {
                await apiRequest(`/orders/${orderId}/status`, 'PATCH', { status: newStatus });
                showMessage(`Order status updated to ${newStatus}`, 'success');
                // The whole view will be re-rendered after a successful update
                loadDashboardData();
            } catch (error) {
                showMessage('Failed to update order status.', 'error');
            }
        });
    });
};

const setupFontSelector = () => {
    const fontSelect = document.getElementById('font-choice');
    const savedFont = localStorage.getItem('adminFont') || 'lato';

    const setFont = (fontName) => {
        document.body.classList.remove('font-poppins', 'font-roboto');
        if (fontName === 'poppins') document.body.classList.add('font-poppins');
        if (fontName === 'roboto') document.body.classList.add('font-roboto');
        fontSelect.value = fontName;
        localStorage.setItem('adminFont', fontName);
    };

    setFont(savedFont);

    fontSelect.addEventListener('change', (e) => {
        setFont(e.target.value);
    });
};

const handleAdminForm = async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('adminName').value;
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const confirmPassword = document.getElementById('adminConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showMessage('Passwords do not match.', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Password must be at least 6 characters long.', 'error');
        return;
    }
    
    try {
        const response = await apiRequest('/admin/users', 'POST', { name, email, password });
        showMessage('Admin user created successfully!', 'success');
        
        // Show temporary password in a modal or alert
        if (response.tempPassword) {
            const tempPasswordModal = `
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #ffd700;">
                    <h4 style="color: #333; margin-top: 0; margin-bottom: 15px;">New Admin Created Successfully!</h4>
                    <p style="margin: 5px 0;"><strong>Name:</strong> ${name}</p>
                    <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 5px 0;"><strong>Temporary Password:</strong> 
                        <span style="background: #ffd700; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold; font-size: 1.1rem;">${response.tempPassword}</span>
                    </p>
                    <p style="color: #ff6b6b; font-size: 14px; margin-top: 15px;">
                        ⚠️ This temporary password has been sent to the new admin's email. 
                        They should change it immediately after their first login.
                    </p>
                </div>
            `;
            
            // Create a temporary modal to show the password
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.style.display = 'flex';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                    <h2 style="text-align: center; margin-bottom: 1rem; color: #ffd700;">Admin Created</h2>
                    ${tempPasswordModal}
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" class="form-button" style="width: auto; padding: 0.5rem 1.5rem;">
                            Close
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        document.getElementById('adminForm').reset();
        loadDashboardData();
    } catch (error) {
        showMessage('Failed to create admin user.', 'error');
    }
};

const handlePasswordChangeForm = async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        showMessage('New passwords do not match.', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showMessage('New password must be at least 6 characters long.', 'error');
        return;
    }
    
    // Check password strength
    const passwordStrength = checkPasswordStrength(newPassword);
    if (passwordStrength === 'weak') {
        if (!confirm('This password is weak. Are you sure you want to use it?')) {
            return;
        }
    }
    
    try {
        await apiRequest('/auth/change-password', 'POST', { currentPassword, newPassword });
        showMessage('Password changed successfully!', 'success');
        document.getElementById('passwordChangeForm').reset();
        closeModal('passwordChangeModal');
    } catch (error) {
        showMessage('Failed to change password.', 'error');
    }
};

// Password strength checker
const checkPasswordStrength = (password) => {
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    
    // Character variety checks
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    
    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
};

// Add password strength indicator
const setupPasswordStrengthIndicator = () => {
    const newPasswordInput = document.getElementById('newPassword');
    if (!newPasswordInput) return;
    
    // Create strength indicator element
    const strengthIndicator = document.createElement('div');
    strengthIndicator.className = 'password-strength';
    strengthIndicator.id = 'passwordStrength';
    newPasswordInput.parentNode.appendChild(strengthIndicator);
    
    newPasswordInput.addEventListener('input', (e) => {
        const password = e.target.value;
        const strength = checkPasswordStrength(password);
        const indicator = document.getElementById('passwordStrength');
        
        if (password.length === 0) {
            indicator.textContent = '';
            indicator.className = 'password-strength';
            return;
        }
        
        indicator.className = `password-strength ${strength}`;
        
        switch (strength) {
            case 'weak':
                indicator.textContent = '⚠️ Weak password';
                break;
            case 'medium':
                indicator.textContent = '⚠️ Medium strength password';
                break;
            case 'strong':
                indicator.textContent = '✅ Strong password';
                break;
        }
    });
};

// Modal functions
const openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        // Setup password strength indicator when opening password change modal
        if (modalId === 'passwordChangeModal') {
            setTimeout(() => {
                setupPasswordStrengthIndicator();
            }, 100);
        }
    }
};

const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        // Clear password strength indicator when closing
        if (modalId === 'passwordChangeModal') {
            const indicator = document.getElementById('passwordStrength');
            if (indicator) {
                indicator.textContent = '';
                indicator.className = 'password-strength';
            }
        }
    }
};

// Add password change button to user list
const renderUsers = (users) => {
    const userList = document.getElementById('userList');
    if (!userList) return;
    
    if (users.length === 0) {
        userList.innerHTML = '<p style="text-align: center; color: var(--color-text-dim);">No users found.</p>';
        return;
    }
    
    userList.innerHTML = `
        <h3>All Users (${users.length})</h3>
        <div style="margin-bottom: 1rem;">
            <button onclick="openModal('passwordChangeModal')" class="form-button" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem; background: linear-gradient(45deg, #3b82f6, #1d4ed8);">
                <i class="fas fa-key"></i> Change My Password
            </button>
        </div>
        ${users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-email">${user.email}</div>
                    <span class="user-role ${user.role}">${user.role}</span>
                </div>
                <div class="user-actions">
                    <button class="change-role-btn" onclick="changeUserRole('${user._id}', '${user.role}')">
                        ${user.role === 'admin' ? 'Make Customer' : 'Make Admin'}
                    </button>
                    <button class="delete-user-btn" onclick="deleteUser('${user._id}', '${user.name}')">
                        Delete
                    </button>
                </div>
            </div>
        `).join('')}
    `;
};

window.changeUserRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'customer' : 'admin';
    if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
        try {
            await apiRequest(`/admin/users/${userId}/role`, 'PATCH', { role: newRole });
            showMessage('User role updated successfully!', 'success');
            const users = await apiRequest('/admin/users');
            renderUsers(users);
        } catch (error) {
            showMessage('Failed to update user role.', 'error');
        }
    }
};

window.deleteUser = async (userId, userName) => {
    if (confirm(`Are you sure you want to delete the user ${userName}? This action is irreversible.`)) {
        try {
            await apiRequest(`/admin/users/${userId}`, 'DELETE');
            showMessage('User deleted successfully!', 'success');
            const users = await apiRequest('/admin/users');
            renderUsers(users);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }
};

window.showOrderDetails = (orderId) => {
    const order = allOrders.find(o => o._id === orderId);
    if (!order) {
        showMessage('Order not found.', 'error');
        return;
    }

    const modalContent = document.getElementById('orderDetailsContent');
    
    const itemsHtml = order.items.map(item => `
        <div class="summary-item">
            <div class="item-details">
                <h4>${item.product ? item.product.name : 'Product not found'} (x${item.quantity})</h4>
                <span>Price: EGP ${item.price.toFixed(2)}</span>
            </div>
            <span class="item-price">EGP ${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');

    const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = order.total - subtotal;

    modalContent.innerHTML = `
        <h2 style="text-align: center; color: #ffd700;">Order Details</h2>
        <p style="text-align: center; font-size: 1.2rem; color: #ccc;">Order #${order.orderNumber}</p>

        <div class="order-details-grid">
            <div class="detail-section">
                <h3>Customer Information</h3>
                <p><strong>Name:</strong> ${order.shippingAddress.name}</p>
                <p><strong>Email:</strong> ${order.shippingAddress.email}</p>
                <p><strong>Phone:</strong> ${order.shippingAddress.phone || 'N/A'}</p>
            </div>

            <div class="detail-section">
                <h3>Shipping Address</h3>
                <p>${order.shippingAddress.address}</p>
                <p>${order.shippingAddress.city}, ${order.shippingAddress.country}</p>
            </div>
        </div>

        <div class="detail-section">
            <h3>Application Summary</h3>
            <div class="summary-items-container">
                ${itemsHtml}
            </div>
            <div class="summary-calculation">
                <div class="calc-row">
                    <span>Subtotal</span>
                    <span>EGP ${subtotal.toFixed(2)}</span>
                </div>
                <div class="calc-row">
                    <span>Shipping</span>
                    <span>EGP ${shipping.toFixed(2)}</span>
                </div>
                <div class="calc-row total">
                    <span>Total</span>
                    <span>EGP ${order.total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `;

    openModal('orderDetailsModal');
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    loadDashboardData();
    setupNavigation();
    setupMobileMenu();
    setupFontSelector();
    document.getElementById('productForm').addEventListener('submit', handleProductForm);
    document.getElementById('formCancelBtn').addEventListener('click', resetProductForm);
    document.getElementById('adminForm').addEventListener('submit', handleAdminForm);
    document.getElementById('passwordChangeForm').addEventListener('submit', handlePasswordChangeForm);
    
    // Handle Image Upload
    document.getElementById('imageUpload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('productImage', file);

        // Check if we're editing an existing product
        const productId = document.getElementById('productId').value;
        const isEditing = !!productId;
        
        if (isEditing) {
            // Get the current image path to delete the old photo
            const currentImage = document.getElementById('image').value;
            if (currentImage) {
                formData.append('oldImagePath', currentImage);
            }
        }

        showMessage('Uploading image...', 'success');

        try {
            // Use different endpoint for editing vs creating
            const endpoint = isEditing ? '/api/upload/replace' : '/api/upload';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Upload failed');
            
            document.getElementById('image').value = result.imageUrl;
            document.getElementById('imagePreview').innerHTML = `<img src="${result.imageUrl}" alt="Image preview">`;
            showMessage('Image uploaded successfully!', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });
}); 