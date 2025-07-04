// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/falak-perfumes';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Not required for Google users
    googleId: { type: String },
    role: { type: String, default: 'customer' },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Product Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    discount: { type: Number, default: 0 }, // Discount percentage
    adminDiscount: { type: Number, default: 0 }, // Admin-controlled discount percentage
    category: { type: String, required: true },
    subcategory: { type: String, required: true }, // trending, bestselling, new
    image: { type: String, default: '' },
    icon: { type: String, required: true },
    inStock: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    reviews: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rating: { type: Number, required: true },
        comment: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    total: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    orderNumber: { type: String, unique: true },
    shippingAddress: {
        name: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        country: String,
        zipCode: String
    },
    billingAddress: {
        name: String,
        address: String,
        city: String,
        country: String,
        zipCode: String
    },
    notifications: {
        emailSent: { type: Boolean, default: false },
        whatsappSent: { type: Boolean, default: false },
        adminNotified: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
    if (this.isNew && !this.orderNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        
        // Get count of orders today
        const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        
        const todayOrders = await this.constructor.countDocuments({
            createdAt: { $gte: todayStart, $lt: todayEnd }
        });
        
        const sequence = (todayOrders + 1).toString().padStart(3, '0');
        this.orderNumber = `FP${year}${month}${day}${sequence}`;
    }
    next();
});

// Feedback Schema
const feedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    approved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Newsletter Schema
const newsletterSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    subscribed: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Newsletter subscriber model
const newsletterSubscriberSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastEmailSent: {
        type: Date
    },
    unsubscribeToken: {
        type: String,
        unique: true
    }
});

// Models
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);
const NewsletterSubscriber = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

// Passport.js Configuration
app.use(passport.initialize());

const areGoogleCredsAvailable = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

if (areGoogleCredsAvailable) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (user) {
                return done(null, user);
            }
            
            user = await User.findOne({ email: profile.emails[0].value });
            if (user) {
                // Link account if user exists with the same email
                user.googleId = profile.id;
                await user.save();
                return done(null, user);
            }

            // Create a new user
            const newUser = new User({
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails[0].value
            });
            await newUser.save();
            done(null, newUser);
        } catch (err) {
            done(err, null);
        }
    }));
} else {
    console.warn(`
    ========================================================================================
    WARNING: Google OAuth credentials are not configured in your .env file.
    Google Login will be disabled.
    To enable it, create a .env file and add:
    GOOGLE_CLIENT_ID=your_google_client_id_here
    GOOGLE_CLIENT_SECRET=your_google_client_secret_here
    ========================================================================================
    `);
}

// WhatsApp Configuration
const areWhatsAppCredsAvailable = process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_PHONE_ID;
let whatsappClient;

if (areWhatsAppCredsAvailable) {
    // For WhatsApp Business API (you'll need to set up with Meta/Facebook)
    // This is a placeholder - you'll need to implement with your preferred WhatsApp API provider
    console.log('WhatsApp notifications enabled');
} else {
    console.warn(`
    ========================================================================================
    WARNING: WhatsApp API credentials are not configured in your .env file.
    WhatsApp notifications will be disabled.
    To enable them, add WHATSAPP_API_KEY and WHATSAPP_PHONE_ID to your .env file.
    ========================================================================================
    `);
}

// Email configuration with anti-spam measures
const areEmailCredsAvailable = process.env.EMAIL_USER && process.env.EMAIL_PASS;
let transporter;

if (areEmailCredsAvailable) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        // Anti-spam configuration
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 14, // Limit to 14 emails per second
        // DKIM and SPF support
        dkim: {
            domainName: process.env.DOMAIN || 'falakperfumes.com',
            keySelector: 'default',
            privateKey: process.env.DKIM_PRIVATE_KEY || '',
            headerFieldNames: 'to:from:subject:date',
            skipFields: 'message-id:date'
        }
    });

    // Set default headers for all emails to improve deliverability
    transporter.use('compile', (mail, callback) => {
        // Add anti-spam headers
        mail.data.headers = {
            ...mail.data.headers,
            'X-Mailer': 'Falak Perfumes Newsletter System',
            'X-Priority': '3',
            'X-MSMail-Priority': 'Normal',
            'Importance': 'normal',
            'X-Report-Abuse': 'Please report abuse here: abuse@falakperfumes.com',
            'List-Owner': '<mailto:admin@falakperfumes.com>',
            'List-Help': '<https://falakperfumes.com/help>',
            'List-Subscribe': '<https://falakperfumes.com/subscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        };
        callback();
    });
} else {
    console.warn(`
    ========================================================================================
    WARNING: Email (Nodemailer) credentials are not configured in your .env file.
    Password reset, order confirmation, and newsletter emails will be disabled.
    To enable them, add EMAIL_USER and EMAIL_PASS to your .env file.
    ========================================================================================
    `);
}

// JWT Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) {
            // Token is expired or invalid
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
};

// Admin Authorization Middleware
const authorizeAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    try {
        const user = await User.findById(req.user.userId);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden: Requires admin access' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Could not authorize admin' });
    }
};

// Multer Configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'public/uploads');
        fs.mkdirSync(uploadPath, { recursive: true }); // Ensure directory exists
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Helper function to delete old product photos
const deleteProductPhoto = async (imagePath) => {
    if (!imagePath || !imagePath.startsWith('/uploads/')) {
        return; // Skip if no image or not a local upload
    }
    
    try {
        const fullPath = path.join(__dirname, 'public', imagePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted old product photo: ${imagePath}`);
        }
    } catch (error) {
        console.error(`Error deleting product photo ${imagePath}:`, error);
    }
};

// Initialize Sample Data
const initializeData = async () => {
    try {
        // Ensure admin user is configured correctly
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@falakperfumes.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        let admin = await User.findOne({ email: adminEmail });

        if (admin) {
            // Update existing admin's password and role to ensure it's correct
            admin.password = hashedPassword;
            admin.role = 'admin';
            admin.name = 'Admin';
            await admin.save();
            console.log(`Admin user (${adminEmail}) credentials have been synchronized.`);
        } else {
            // Create a new admin user if one doesn't exist
            await User.create({
                name: 'Admin',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin'
            });
            console.log(`Admin user (${adminEmail}) created successfully.`);
        }

        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            const sampleProducts = [
                // Trending Products
                {
                    name: "Nebula Noir",
                    description: "A mysterious blend inspired by dark matter and cosmic mysteries. Notes of bergamot, black pepper, and sandalwood create an enigmatic fragrance.",
                    price: 125,
                    category: "men",
                    subcategory: "trending",
                    icon: "fas fa-meteor",
                    rating: 4.8
                },
                {
                    name: "Stellar Rose",
                    description: "Feminine and elegant, like roses blooming in a cosmic garden. Delicate notes of rose, jasmine, and white musk.",
                    price: 95,
                    category: "women",
                    subcategory: "trending",
                    icon: "fas fa-star",
                    rating: 4.7
                },
                {
                    name: "Cosmic Bloom",
                    description: "Delicate and enchanting, like flowers blooming in zero gravity. Fresh florals with hints of citrus and cedar.",
                    price: 120,
                    category: "women",
                    subcategory: "trending",
                    icon: "fas fa-seedling",
                    rating: 4.9
                },
                
                // Best Selling Products
                {
                    name: "Galaxy Storm",
                    description: "Bold and powerful, capturing the energy of cosmic storms. Intense blend of leather, tobacco, and vanilla.",
                    price: 140,
                    category: "men",
                    subcategory: "bestselling",
                    icon: "fas fa-bolt",
                    rating: 4.9
                },
                {
                    name: "Moonlight Serenade",
                    description: "Soft and dreamy, like moonbeams dancing on celestial waters. Aquatic notes with white florals and soft woods.",
                    price: 110,
                    category: "women",
                    subcategory: "bestselling",
                    icon: "fas fa-moon",
                    rating: 4.8
                },
                {
                    name: "Solar Flare",
                    description: "Intense and fiery, inspired by the raw power of the sun. Spicy notes of cardamom, cinnamon, and amber.",
                    price: 155,
                    category: "men",
                    subcategory: "bestselling",
                    icon: "fas fa-sun",
                    rating: 4.7
                },
                
                // New Collection
                {
                    name: "Andromeda Dreams",
                    description: "Journey through the Andromeda galaxy with this celestial blend. Ethereal notes of iris, violet, and soft woods.",
                    price: 135,
                    category: "women",
                    subcategory: "new",
                    icon: "fas fa-space-shuttle",
                    rating: 4.6
                },
                {
                    name: "Orion's Belt",
                    description: "Strong and masculine like the constellation itself. Bold notes of oud, patchouli, and dark chocolate.",
                    price: 180,
                    category: "men",
                    subcategory: "new",
                    icon: "fas fa-satellite",
                    rating: 4.8
                },
                {
                    name: "Milky Way Mist",
                    description: "Light and airy like cosmic dust floating through space. Powdery notes of vanilla, musk, and soft florals.",
                    price: 115,
                    category: "women",
                    subcategory: "new",
                    icon: "fas fa-cloud",
                    rating: 4.5
                }
            ];

            await Product.insertMany(sampleProducts);
            console.log('Sample products inserted');
        }

        // Sample Feedback
        const feedbackCount = await Feedback.countDocuments();
        if (feedbackCount === 0) {
            const sampleFeedback = [
                {
                    name: "Nourhan Adel",
                    email: "nourhan@example.com",
                    rating: 5,
                    comment: "Galaxy Storm is my new signature scent for nights out in Cairo. It's powerful and gets so many compliments!",
                    approved: true
                },
                {
                    name: "Ahmed El-Masry",
                    email: "ahmed@example.com",
                    rating: 5,
                    comment: "I bought Stellar Rose for my wife for our anniversary, and she adores it. The packaging felt so luxurious, perfect for a gift.",
                    approved: true
                },
                {
                    name: "Fatma Ali",
                    email: "fatma@example.com",
                    rating: 4,
                    comment: "Moonlight Serenade is perfect for summer evenings by the coast. It's so fresh and elegant. I wish it lasted a little longer, but it's beautiful.",
                    approved: true
                },
                {
                    name: "Khaled Youssef",
                    email: "khaled@example.com",
                    rating: 5,
                    comment: "Finally, a local brand that competes internationally. Orion's Belt is world-class. Proud to support this!",
                    approved: true
                }
            ];

            await Feedback.insertMany(sampleFeedback);
            console.log('Sample Egyptian feedback inserted');
        }

    } catch (error) {
        console.error('Error initializing data:', error);
    }
};

// Routes

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            name,
            email,
            password: hashedPassword
        });

        await user.save();

        // Generate token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`\n[Login Attempt] Email: ${email}`);

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            console.log('[Login Result] User not found in database.');
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        console.log(`[Login Result] User found. Name: ${user.name}, Role: ${user.role}`);
        console.log(`[Login Info] User has a password stored: ${!!user.password}`);

        // Check password
        if (!user.password) {
            console.log('[Login Result] User exists but has no password (likely a Google account).');
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('[Login Result] Password comparison failed.');
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        console.log('[Login Result] Password comparison successful. Generating token.');

        // Generate token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Product Routes
app.get('/api/products', async (req, res) => {
    try {
        const { category, subcategory } = req.query;
        let filter = {};
        
        if (category) filter.category = category;
        if (subcategory) filter.subcategory = subcategory;

        const products = await Product.find(filter);
        
        const productsWithDiscounts = products.map(product => {
            // Use admin discount if set, otherwise use random discount
            let discountPercentage = product.adminDiscount || 0;
            
            if (discountPercentage === 0) {
                // Apply a random discount between 10% and 20% if no admin discount
                discountPercentage = Math.floor(Math.random() * (20 - 10 + 1)) + 10;
            }
            
            if (product.discount > 0 && product.originalPrice) {
                // If discount is already applied, just return the product with formatted prices
                return {
                    ...product.toObject(),
                    price: product.price,
                    originalPrice: product.originalPrice,
                    discountPercentage: product.discount
                };
            }

            const discount = (product.price * discountPercentage) / 100;
            const discountedPrice = product.price - discount;

            // Storing original price and discount info
            product.originalPrice = product.price;
            product.price = parseFloat(discountedPrice.toFixed(2));
            product.discount = discountPercentage;
            
            // Save the updated price to the database
            product.save();

            return {
                ...product.toObject(),
                price: product.price,
                originalPrice: product.originalPrice,
                discountPercentage: discountPercentage
            };
        });

        res.json(productsWithDiscounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('reviews.user', 'name');
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Order Routes
app.post('/api/orders', async (req, res) => {
    try {
        const { items, total, shippingAddress, billingAddress } = req.body;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        let userId = null;

        if (token) {
            try {
                // Verify token if it exists, but don't fail if it's invalid for guest checkout
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
                userId = decoded.userId;
            } catch (err) {
                console.log("Invalid token during order creation, proceeding as guest.");
            }
        }

        const orderData = {
            items,
            total,
            shippingAddress,
            billingAddress
        };

        if (userId) {
            orderData.user = userId;
        }

        const order = new Order(orderData);
        await order.save();

        // Populate product details for notifications
        await order.populate('items.product');

        // Send notifications
        if (order.shippingAddress.email) {
            await sendOrderConfirmationEmail(order);
        }
        
        // Send WhatsApp notification (placeholder)
        await sendWhatsAppNotification(order);
        
        // Send notification to all admins
        await sendAdminNotification(order);
        
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.userId })
            .populate('items.product')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Update order status
app.patch('/api/orders/:id/status', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Pending', 'In Process', 'Completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const order = await Order.findById(req.params.id).populate('items.product');
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const oldStatus = order.status;
        order.status = status;
        await order.save();
        
        // Send status update email to customer
        await sendStatusUpdateEmail(order, oldStatus, status);
        
        // Send notification to all admins
        await sendAdminStatusUpdateNotification(order, oldStatus, status);
        
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Delete an order
app.delete('/api/orders/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Feedback Routes
app.post('/api/feedback', async (req, res) => {
    try {
        const { name, email, rating, comment } = req.body;

        const feedback = new Feedback({
            name,
            email,
            rating,
            comment
        });

        await feedback.save();
        res.status(201).json({ message: 'Feedback submitted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/feedback', async (req, res) => {
    try {
        const feedback = await Feedback.find({ approved: true })
            .sort({ createdAt: -1 })
            .limit(10);
        res.json(feedback);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Newsletter Routes
app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        
        // Check if email already subscribed
        const existingSubscriber = await NewsletterSubscriber.findOne({ email });
        if (existingSubscriber) {
            return res.status(400).json({ error: 'Email is already subscribed to our newsletter' });
        }
        
        // Create new subscriber
        const subscriber = new NewsletterSubscriber({
            email,
            subscribedAt: new Date(),
            isActive: true
        });
        
        await subscriber.save();
        
        // Send welcome email
        if (areEmailCredsAvailable) {
            await sendNewsletterWelcomeEmail(email);
        }
        
        res.json({ 
            message: 'Successfully subscribed to our newsletter!',
            email: email
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/newsletter/unsubscribe', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Unsubscribe token is required' });
        }
        
        const subscriber = await NewsletterSubscriber.findOne({ unsubscribeToken: token });
        if (!subscriber) {
            return res.status(404).json({ error: 'Subscriber not found' });
        }
        
        subscriber.isActive = false;
        await subscriber.save();
        
        res.json({ message: 'Successfully unsubscribed from our newsletter' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Routes (Basic)
app.get('/api/admin/stats', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const newUsersLast30Days = await User.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();
        
        // Calculate revenue from existing orders (excluding deleted ones)
        const revenueResult = await Order.aggregate([
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        res.json({
            totalUsers,
            newUsersLast30Days,
            totalProducts,
            totalOrders,
            totalRevenue,
            averageOrderValue
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/orders', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate('user', 'name email')
            .populate('items.product', 'name')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/users', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const users = await User.find({}, 'name email role createdAt');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Create new admin user
app.post('/api/admin/users', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Generate a secure temporary password
        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).toUpperCase().slice(-4) + '!1';
        
        // Hash the temporary password
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Create new admin user
        const newAdmin = new User({
            name,
            email,
            password: hashedPassword,
            role: 'admin'
        });

        await newAdmin.save();

        // Send welcome email to new admin with temporary password
        if (areEmailCredsAvailable) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Welcome to Falak Perfumes Admin Team',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                        <div style="background: linear-gradient(45deg, #4ecdc4, #44a08d); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to the Team!</h1>
                            <p style="color: white; margin: 5px 0 0 0; font-size: 16px;">Falak Perfumes Admin</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                            <h2 style="color: #333; margin-bottom: 20px;">Welcome ${name}!</h2>
                            
                            <p style="color: #666; line-height: 1.6;">
                                You have been added as an administrator to the Falak Perfumes admin panel. 
                                You now have access to manage products, orders, and view analytics.
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h4 style="color: #333; margin-top: 0;">Your Login Credentials:</h4>
                                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="background: #ffd700; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-weight: bold;">${tempPassword}</span></p>
                                <p style="color: #ff6b6b; font-size: 14px; margin-top: 10px;">
                                    ⚠️ This is a temporary password. Please change it immediately after your first login for security.
                                </p>
                            </div>
                            
                            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                                <h4 style="color: #28a745; margin-top: 0;">Important Security Note:</h4>
                                <p style="color: #666; margin: 5px 0; font-size: 14px;">
                                    • Use the temporary password above for your first login<br>
                                    • Change your password immediately after logging in<br>
                                    • Keep your credentials secure and don't share them<br>
                                    • Log out when you're done using the admin panel
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/admin.html" 
                                   style="background: #4ecdc4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                    Access Admin Panel
                                </a>
                            </div>
                            
                            <p style="color: #666; font-size: 14px; text-align: center; margin-top: 20px;">
                                If you have any questions, please contact the main administrator.
                            </p>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`Welcome email sent to new admin: ${email}`);
        }

        res.status(201).json({ 
            message: 'Admin user created successfully',
            user: { 
                id: newAdmin._id, 
                name: newAdmin.name, 
                email: newAdmin.email, 
                role: newAdmin.role 
            },
            tempPassword: tempPassword // Return the temp password for immediate display
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Update user role
app.patch('/api/admin/users/:id/role', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['customer', 'admin'];
        
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            message: 'User role updated successfully',
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                role: user.role 
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Delete user
app.delete('/api/admin/users/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deleting the last admin
        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin user' });
            }
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Create a new product
app.post('/api/products', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ADMIN ONLY: Update a product
app.put('/api/products/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const oldProduct = await Product.findById(req.params.id);
        if (!oldProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Check if image is being updated
        const newImage = req.body.image;
        const oldImage = oldProduct.image;
        
        // If there's a new image and it's different from the old one, delete the old image
        if (newImage && newImage !== oldImage && oldImage) {
            await deleteProductPhoto(oldImage);
        }

        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ADMIN ONLY: Delete a product
app.delete('/api/products/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete the product's photo if it exists
        if (product.image) {
            await deleteProductPhoto(product.image);
        }

        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ONLY: Image Upload Route
app.post('/api/upload', authenticateToken, authorizeAdmin, upload.single('productImage'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file type is incorrect.' });
    }
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
}, (error, req, res, next) => {
    res.status(400).json({ error: error.message });
});

// ADMIN ONLY: Delete old photo when replacing with new one
app.post('/api/upload/replace', authenticateToken, authorizeAdmin, upload.single('productImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file type is incorrect.' });
    }

    try {
        const { oldImagePath } = req.body;
        
        // Delete the old image if provided
        if (oldImagePath) {
            await deleteProductPhoto(oldImagePath);
        }

        res.json({ imageUrl: `/uploads/${req.file.filename}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}, (error, req, res, next) => {
    res.status(400).json({ error: error.message });
});

// Google Auth Routes
if (areGoogleCredsAvailable) {
    app.get('/api/auth/google',
        passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/api/auth/google/callback', 
        passport.authenticate('google', { failureRedirect: '/login', session: false }),
        (req, res) => {
            // Successful authentication
            const token = jwt.sign(
                { userId: req.user._id, email: req.user.email },
                process.env.JWT_SECRET || 'fallback_secret',
                { expiresIn: '24h' }
            );
            const user = { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role };
            // Redirect to frontend with token
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
        }
    );
}

// Password Reset Routes
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            // Respond politely to prevent user enumeration
            return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetURL = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;

        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'Falak Perfumes Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                  `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                  `${resetURL}\n\n` +
                  `If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };

        if (areEmailCredsAvailable) {
            await transporter.sendMail(mailOptions);
            res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        } else {
            res.status(500).json({ error: 'Email services are not configured.' });
        }

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password has been reset successfully.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }
        
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        user.password = hashedNewPassword;
        await user.save();
        
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Notification Functions
const sendOrderConfirmationEmail = async (order) => {
    if (!areEmailCredsAvailable) {
        console.log('Email service not configured, skipping email notification');
        return;
    }

    try {
        const customerEmail = order.shippingAddress.email;
        const itemsList = order.items.map(item => 
            `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">EGP ${item.price.toFixed(2)}</td>
            </tr>`
        ).join('');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: customerEmail,
            subject: `Order Confirmation - ${order.orderNumber} | Falak Perfumes`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                    <div style="background: linear-gradient(45deg, #ffd700, #ff6b6b); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Falak Perfumes</h1>
                        <p style="color: white; margin: 5px 0 0 0; font-size: 16px;">Cosmic Fragrances</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">Order Confirmation</h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
                            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #ff6b6b; font-weight: bold;">${order.status}</span></p>
                        </div>
                        
                        <h3 style="color: #333; margin-bottom: 15px;">Order Summary</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsList}
                            </tbody>
                        </table>
                        
                        <div style="text-align: right; margin-bottom: 20px;">
                            <h3 style="color: #333; margin: 0;">Total: EGP ${order.total.toFixed(2)}</h3>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h4 style="color: #333; margin-top: 0;">Shipping Address</h4>
                            <p style="margin: 5px 0;">${order.shippingAddress.name}</p>
                            <p style="margin: 5px 0;">${order.shippingAddress.address}</p>
                            <p style="margin: 5px 0;">${order.shippingAddress.city}, ${order.shippingAddress.country} ${order.shippingAddress.zipCode}</p>
                            <p style="margin: 5px 0;">Phone: ${order.shippingAddress.phone || 'Not provided'}</p>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center;">
                            Thank you for choosing Falak Perfumes! We'll send you another email when your order ships.
                        </p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #999; font-size: 12px;">
                                If you have any questions, please contact us at support@falakperfumes.com
                            </p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Order confirmation email sent to ${customerEmail}`);
        
        // Update order notification status
        order.notifications.emailSent = true;
        await order.save();
        
    } catch (error) {
        console.error('Error sending order confirmation email:', error);
    }
};

const sendWhatsAppNotification = async (order, phoneNumber, customerName) => {
    if (!areWhatsAppCredsAvailable || !phoneNumber) {
        console.log('WhatsApp service not configured or no phone number, skipping WhatsApp notification');
        return;
    }

    try {
        const itemsList = order.items.map(item => 
            `• ${item.product.name} (Qty: ${item.quantity}) - EGP ${item.price.toFixed(2)}`
        ).join('\n');

        const message = `🎉 *Order Confirmation - Falak Perfumes*

*Order Number:* ${order.orderNumber}
*Date:* ${new Date(order.createdAt).toLocaleDateString()}
*Status:* ${order.status}

*Order Summary:*
${itemsList}

*Total:* EGP ${order.total.toFixed(2)}

*Shipping Address:*
${order.shippingAddress.name}
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.country}

Thank you for choosing Falak Perfumes! 🌟
We'll notify you when your order ships.

For support: support@falakperfumes.com`;

        // This is a placeholder for WhatsApp API integration
        // You'll need to implement with your preferred WhatsApp API provider
        console.log(`WhatsApp notification would be sent to ${phoneNumber}:`, message);
        
        // Update order notification status
        order.notifications.whatsappSent = true;
        await order.save();
        
    } catch (error) {
        console.error('Error sending WhatsApp notification:', error);
    }
};

const sendAdminNotification = async (order) => {
    if (!areEmailCredsAvailable) {
        console.log('Email service not configured, skipping admin notification');
        return;
    }

    try {
        // Get all admin users
        const admins = await User.find({ role: 'admin' });
        
        if (admins.length === 0) {
            console.log('No admin users found');
            return;
        }

        const adminEmails = admins.map(admin => admin.email);
        
        const itemsList = order.items.map(item => 
            `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">EGP ${item.price.toFixed(2)}</td>
            </tr>`
        ).join('');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails.join(', '),
            subject: `🆕 New Order Received - ${order.orderNumber} | Falak Perfumes`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                    <div style="background: linear-gradient(45deg, #4ecdc4, #44a08d); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">🆕 New Order Alert</h1>
                        <p style="color: white; margin: 5px 0 0 0; font-size: 16px;">Falak Perfumes Admin</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">New Order Details</h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
                            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                            <p style="margin: 5px 0;"><strong>Customer:</strong> ${order.shippingAddress.name}</p>
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${order.shippingAddress.email}</p>
                            <p style="margin: 5px 0;"><strong>Phone:</strong> ${order.shippingAddress.phone || 'Not provided'}</p>
                            <p style="margin: 5px 0;"><strong>Total:</strong> EGP ${order.total.toFixed(2)}</p>
                        </div>
                        
                        <h3 style="color: #333; margin-bottom: 15px;">Order Items</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsList}
                            </tbody>
                        </table>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h4 style="color: #333; margin-top: 0;">Shipping Address</h4>
                            <p style="margin: 5px 0;">${order.shippingAddress.address}</p>
                            <p style="margin: 5px 0;">${order.shippingAddress.city}, ${order.shippingAddress.country} ${order.shippingAddress.zipCode}</p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/admin.html#orders" 
                               style="background: #4ecdc4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Order in Admin Panel
                            </a>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Admin notification sent to all admins for order ${order.orderNumber}`);
        
        // Update order notification status
        order.notifications.adminNotified = true;
        await order.save();
        
    } catch (error) {
        console.error('Error sending admin notification:', error);
    }
};

// Send status update email to customer
const sendStatusUpdateEmail = async (order, oldStatus, newStatus) => {
    if (!areEmailCredsAvailable) {
        console.log('Email service not configured, skipping status update email');
        return;
    }

    try {
        const statusColors = {
            'Pending': '#f59e0b',
            'In Process': '#3b82f6',
            'Completed': '#10b981'
        };

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: order.shippingAddress.email,
            subject: `Order Status Updated - ${order.orderNumber} | Falak Perfumes`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                    <div style="background: linear-gradient(45deg, #ffd700, #ff6b6b); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Order Status Updated</h1>
                        <p style="color: white; margin: 5px 0 0 0; font-size: 16px;">Falak Perfumes</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">Your Order Status Has Changed</h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
                            <p style="margin: 5px 0;"><strong>Previous Status:</strong> <span style="color: ${statusColors[oldStatus] || '#666'};">${oldStatus}</span></p>
                            <p style="margin: 5px 0;"><strong>New Status:</strong> <span style="color: ${statusColors[newStatus] || '#666'}; font-weight: bold;">${newStatus}</span></p>
                            <p style="margin: 5px 0;"><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h4 style="color: #333; margin-top: 0;">What This Means:</h4>
                            ${newStatus === 'Pending' ? '<p>Your order is being reviewed and will be processed soon.</p>' : ''}
                            ${newStatus === 'In Process' ? '<p>Your order is now being prepared and will be shipped shortly.</p>' : ''}
                            ${newStatus === 'Completed' ? '<p>Your order has been completed and delivered. Thank you for choosing Falak Perfumes!</p>' : ''}
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center;">
                            If you have any questions about your order, please contact us at support@falakperfumes.com
                        </p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}" 
                               style="background: #ffd700; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                                Visit Our Store
                            </a>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Status update email sent to ${order.shippingAddress.email}`);
        
    } catch (error) {
        console.error('Error sending status update email:', error);
    }
};

// Send notification to all admins about status update
const sendAdminStatusUpdateNotification = async (order, oldStatus, newStatus) => {
    if (!areEmailCredsAvailable) {
        console.log('Email service not configured, skipping admin status update notification');
        return;
    }

    try {
        // Get all admin users
        const admins = await User.find({ role: 'admin' });
        
        if (admins.length === 0) {
            console.log('No admin users found');
            return;
        }

        const adminEmails = admins.map(admin => admin.email);
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: adminEmails.join(', '),
            subject: `📊 Order Status Updated - ${order.orderNumber} | Falak Perfumes`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                    <div style="background: linear-gradient(45deg, #4ecdc4, #44a08d); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">📊 Order Status Updated</h1>
                        <p style="color: white; margin: 5px 0 0 0; font-size: 16px;">Falak Perfumes Admin</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">Order Status Change Notification</h2>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
                            <p style="margin: 5px 0;"><strong>Customer:</strong> ${order.shippingAddress.name}</p>
                            <p style="margin: 5px 0;"><strong>Previous Status:</strong> <span style="color: #f59e0b;">${oldStatus}</span></p>
                            <p style="margin: 5px 0;"><strong>New Status:</strong> <span style="color: #10b981; font-weight: bold;">${newStatus}</span></p>
                            <p style="margin: 5px 0;"><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
                            <p style="margin: 5px 0;"><strong>Total:</strong> EGP ${order.total.toFixed(2)}</p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/admin.html#orders" 
                               style="background: #4ecdc4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Order in Admin Panel
                            </a>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Status update notification sent to all admins for order ${order.orderNumber}`);
        
    } catch (error) {
        console.error('Error sending admin status update notification:', error);
    }
};

// Send welcome email to newsletter subscribers
const sendNewsletterWelcomeEmail = async (email) => {
    if (!areEmailCredsAvailable) {
        console.log('Email service not configured, skipping newsletter welcome email');
        return;
    }

    try {
        const unsubscribeToken = crypto.randomBytes(32).toString('hex');
        
        // Update subscriber with unsubscribe token
        await NewsletterSubscriber.findOneAndUpdate(
            { email },
            { unsubscribeToken },
            { new: true }
        );

        const mailOptions = {
            from: {
                name: 'Falak Perfumes',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: '🌟 Welcome to the Falak Universe! Your Cosmic Journey Begins',
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta name="color-scheme" content="light dark">
                    <meta name="supported-color-schemes" content="light dark">
                    <title>Welcome to Falak Perfumes</title>
                    <style>
                        /* Reset and base styles */
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            background-color: #f4f4f4;
                            margin: 0;
                            padding: 0;
                        }
                        
                        .email-container {
                            max-width: 600px;
                            margin: 0 auto;
                            background-color: #ffffff;
                            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
                        }
                        
                        /* Header with cosmic gradient */
                        .email-header {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            padding: 40px 30px;
                            text-align: center;
                            position: relative;
                            overflow: hidden;
                        }
                        
                        .email-header::before {
                            content: '';
                            position: absolute;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="stars" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="white" opacity="0.3"/></pattern></defs><rect width="100" height="100" fill="url(%23stars)"/></svg>');
                            opacity: 0.3;
                        }
                        
                        .logo {
                            font-size: 2.5rem;
                            font-weight: bold;
                            color: white;
                            margin-bottom: 10px;
                            position: relative;
                            z-index: 1;
                            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                        }
                        
                        .welcome-title {
                            font-size: 1.8rem;
                            color: white;
                            margin-bottom: 10px;
                            position: relative;
                            z-index: 1;
                            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
                        }
                        
                        .welcome-subtitle {
                            font-size: 1.1rem;
                            color: rgba(255, 255, 255, 0.9);
                            position: relative;
                            z-index: 1;
                        }
                        
                        /* Main content */
                        .email-content {
                            padding: 40px 30px;
                        }
                        
                        .welcome-message {
                            font-size: 1.1rem;
                            color: #555;
                            margin-bottom: 30px;
                            line-height: 1.8;
                        }
                        
                        .features-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 20px;
                            margin: 30px 0;
                        }
                        
                        .feature-item {
                            text-align: center;
                            padding: 20px;
                            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                            border-radius: 15px;
                            border: 1px solid #dee2e6;
                        }
                        
                        .feature-icon {
                            font-size: 2rem;
                            margin-bottom: 10px;
                            color: #667eea;
                        }
                        
                        .feature-title {
                            font-size: 1rem;
                            font-weight: bold;
                            color: #333;
                            margin-bottom: 5px;
                        }
                        
                        .feature-desc {
                            font-size: 0.9rem;
                            color: #666;
                        }
                        
                        /* CTA Button */
                        .cta-section {
                            text-align: center;
                            margin: 40px 0;
                        }
                        
                        .cta-button {
                            display: inline-block;
                            background: linear-gradient(45deg, #ffd700, #ff6b6b);
                            color: #333;
                            text-decoration: none;
                            padding: 15px 30px;
                            border-radius: 50px;
                            font-weight: bold;
                            font-size: 1.1rem;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            box-shadow: 0 8px 25px rgba(255, 215, 0, 0.3);
                            transition: all 0.3s ease;
                        }
                        
                        .cta-button:hover {
                            transform: translateY(-3px);
                            box-shadow: 0 12px 35px rgba(255, 107, 107, 0.4);
                        }
                        
                        /* Footer */
                        .email-footer {
                            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
                            color: white;
                            padding: 30px;
                            text-align: center;
                        }
                        
                        .social-links {
                            margin: 20px 0;
                        }
                        
                        .social-links a {
                            display: inline-block;
                            margin: 0 10px;
                            color: white;
                            text-decoration: none;
                            font-size: 1.5rem;
                        }
                        
                        .unsubscribe-link {
                            color: #bdc3c7;
                            text-decoration: none;
                            font-size: 0.9rem;
                        }
                        
                        .unsubscribe-link:hover {
                            color: white;
                        }
                        
                        /* Responsive design */
                        @media (max-width: 600px) {
                            .email-container {
                                margin: 0;
                            }
                            
                            .email-header {
                                padding: 30px 20px;
                            }
                            
                            .logo {
                                font-size: 2rem;
                            }
                            
                            .welcome-title {
                                font-size: 1.5rem;
                            }
                            
                            .email-content {
                                padding: 30px 20px;
                            }
                            
                            .features-grid {
                                grid-template-columns: 1fr;
                                gap: 15px;
                            }
                            
                            .cta-button {
                                padding: 12px 25px;
                                font-size: 1rem;
                            }
                        }
                        
                        /* Dark mode support */
                        @media (prefers-color-scheme: dark) {
                            body {
                                background-color: #1a1a1a;
                                color: #e0e0e0;
                            }
                            
                            .email-container {
                                background-color: #2d2d2d;
                            }
                            
                            .welcome-message {
                                color: #e0e0e0;
                            }
                            
                            .feature-item {
                                background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
                                border-color: #4a4a4a;
                            }
                            
                            .feature-title {
                                color: #e0e0e0;
                            }
                            
                            .feature-desc {
                                color: #b0b0b0;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="email-container">
                        <div class="email-header">
                            <div class="logo">Falak</div>
                            <h1 class="welcome-title">Welcome to the Universe!</h1>
                            <p class="welcome-subtitle">Your cosmic journey with extraordinary fragrances begins now</p>
                        </div>
                        
                        <div class="email-content">
                            <p class="welcome-message">
                                Dear Fragrance Enthusiast,<br><br>
                                
                                Welcome to the <strong>Falak Universe</strong>! 🌟 You've just joined an exclusive community of cosmic fragrance lovers who appreciate the art of extraordinary scents.<br><br>
                                
                                We're thrilled to have you as part of our journey through the stars, where every perfume tells a story of distant galaxies, shimmering nebulae, and celestial phenomena.
                            </p>
                            
                            <div class="features-grid">
                                <div class="feature-item">
                                    <div class="feature-icon">⭐</div>
                                    <div class="feature-title">Exclusive Access</div>
                                    <div class="feature-desc">Be the first to discover new cosmic collections and limited editions</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-icon">🎁</div>
                                    <div class="feature-title">Special Offers</div>
                                    <div class="feature-desc">Receive exclusive discounts and early access to sales</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-icon">🌌</div>
                                    <div class="feature-title">Cosmic Stories</div>
                                    <div class="feature-desc">Learn about the celestial inspiration behind each fragrance</div>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-icon">✨</div>
                                    <div class="feature-title">VIP Events</div>
                                    <div class="feature-desc">Get invited to exclusive fragrance launches and cosmic events</div>
                                </div>
                            </div>
                            
                            <div class="cta-section">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}" class="cta-button">
                                    Explore Our Universe
                                </a>
                            </div>
                            
                            <p style="text-align: center; color: #666; font-size: 0.9rem; margin-top: 30px;">
                                Thank you for choosing to journey with us through the cosmos of fragrance.<br>
                                <strong>Welcome to the Falak family! 🌟</strong>
                            </p>
                        </div>
                        
                        <div class="email-footer">
                            <div class="social-links">
                                <a href="#" title="Facebook">📘</a>
                                <a href="#" title="Instagram">📷</a>
                                <a href="#" title="Twitter">🐦</a>
                                <a href="#" title="YouTube">📺</a>
                            </div>
                            
                            <p style="margin: 20px 0; font-size: 0.9rem;">
                                © 2025 Falak Perfumes. All rights reserved.<br>
                                Inspired by the cosmos, crafted for you.
                            </p>
                            
                            <p style="font-size: 0.8rem; color: #bdc3c7;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/unsubscribe?token=${unsubscribeToken}" class="unsubscribe-link">
                                    Unsubscribe from this newsletter
                                </a>
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            headers: {
                'List-Unsubscribe': `<${process.env.FRONTEND_URL || 'http://localhost:5000'}/unsubscribe?token=${unsubscribeToken}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                'Precedence': 'bulk',
                'X-Auto-Response-Suppress': 'OOF, AutoReply'
            }
        };

        await transporter.sendMail(mailOptions);
        console.log(`Newsletter welcome email sent to: ${email}`);
        
    } catch (error) {
        console.error('Error sending newsletter welcome email:', error);
    }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializeData();
});

module.exports = app;