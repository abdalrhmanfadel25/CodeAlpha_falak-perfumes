# 🌟 Falak Perfumes - Cosmic Fragrance E-Commerce Platform

A stunning, feature-rich e-commerce platform for luxury perfumes inspired by the cosmos. Built with Node.js, Express, MongoDB, and modern web technologies.

![Falak Perfumes](https://img.shields.io/badge/Falak-Perfumes-purple?style=for-the-badge&logo=star)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.18+-black?style=for-the-badge&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-6+-green?style=for-the-badge&logo=mongodb)

## ✨ Features

### 🛍️ **E-Commerce Features**
- **Product Catalog**: Beautiful product display with cosmic theme
- **Shopping Cart**: Real-time cart management with sidebar
- **Checkout System**: Complete order processing with shipping details
- **Product Categories**: Men's and Women's fragrance sections
- **Product Details**: Interactive modal with detailed product information
- **Discount System**: Automatic and admin-controlled discounts (10-20%)
- **Order Management**: Complete order lifecycle management

### 👨‍💼 **Admin Panel**
- **Dashboard**: Real-time analytics and statistics
- **Product Management**: Add, edit, delete products with image upload
- **Order Management**: Drag-and-drop order status updates
- **User Management**: Create and manage admin users
- **Inventory Control**: Track product stock and sales
- **Revenue Analytics**: Detailed financial reporting

### 📧 **Email System**
- **Order Confirmations**: Beautiful order confirmation emails
- **Status Updates**: Customer notifications for order status changes
- **Admin Notifications**: Real-time admin alerts for new orders
- **Newsletter System**: Welcome emails with cosmic design
- **Password Reset**: Secure password recovery system
- **Anti-Spam Measures**: Professional email deliverability

### 🔐 **Security Features**
- **JWT Authentication**: Secure user authentication
- **Password Hashing**: bcrypt encryption for passwords
- **Admin Authorization**: Role-based access control
- **Secure File Upload**: Image upload with validation
- **CSRF Protection**: Cross-site request forgery prevention

### 📱 **Responsive Design**
- **Mobile-First**: Optimized for all device sizes
- **Touch-Friendly**: Mobile-optimized interactions
- **Progressive Web App**: Fast loading and offline capabilities
- **Cross-Browser**: Compatible with all modern browsers

### 🌌 **Cosmic Theme**
- **Stellar Design**: Space-inspired visual elements
- **Animated Effects**: Smooth transitions and hover effects
- **Gradient Backgrounds**: Beautiful cosmic color schemes
- **Interactive Elements**: Engaging user interface

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB 6+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/falak-perfumes.git
   cd falak-perfumes
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/falak-perfumes
   JWT_SECRET=your-super-secret-jwt-key
   
   # Email Configuration (Gmail)
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ADMIN_EMAIL=admin@falakperfumes.com
   
   # Optional: WhatsApp API (for notifications)
   WHATSAPP_API_KEY=your-whatsapp-api-key
   WHATSAPP_PHONE_ID=your-whatsapp-phone-id
   
   # Optional: Domain for email links
   FRONTEND_URL=http://localhost:5000
   DOMAIN=falakperfumes.com
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - **Main Site**: http://localhost:5000
   - **Admin Panel**: http://localhost:5000/admin.html
   - **Default Admin**: admin@falakperfumes.com / admin123

## 🌐 GitHub Pages Deployment

### **Option 1: Static Frontend Only (Recommended for Demo)**

This option deploys only the frontend files to GitHub Pages for demonstration purposes:

1. **Enable GitHub Pages**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Select "Deploy from a branch"
   - Choose "gh-pages" branch
   - Save the settings

2. **Deploy automatically**
   - Push your code to the main branch
   - GitHub Actions will automatically build and deploy to `gh-pages` branch
   - Your site will be available at: `https://yourusername.github.io/repository-name`

3. **Access your deployed site**
   - **Live Demo**: https://abdalrhmanfadel25.github.io/CodeAlpha_falak-perfumes/
   - **Note**: This is a static version without backend functionality

### **Option 2: Full Stack Deployment**

For the complete application with backend functionality:

1. **Deploy Backend to Railway/Heroku**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Deploy to Railway
   railway login
   railway init
   railway up
   ```

2. **Update Frontend URLs**
   - Update API endpoints in `public/script.js` and `public/admin.js`
   - Replace `http://localhost:5000` with your deployed backend URL

3. **Environment Variables**
   - Set up environment variables in your hosting platform
   - Configure MongoDB Atlas for database
   - Set up email credentials

### **Option 3: Vercel Deployment**

1. **Connect to Vercel**
   - Install Vercel CLI: `npm i -g vercel`
   - Run: `vercel` in your project directory
   - Follow the setup wizard

2. **Configure for Full Stack**
   - Vercel will automatically detect your Node.js app
   - Set environment variables in Vercel dashboard
   - Deploy with: `vercel --prod`

## 📁 Project Structure

```
falak-perfumes/
├── docs/                   # Frontend assets (GitHub Pages)
│   ├── index.html         # Main landing page
│   ├── admin.html         # Admin dashboard
│   ├── checkout.html      # Checkout page
│   ├── reset-password.html # Password reset page
│   ├── styles.css         # Main stylesheet
│   ├── admin.css          # Admin panel styles
│   ├── checkout.css       # Checkout styles
│   ├── script.js          # Main JavaScript
│   ├── admin.js           # Admin panel JavaScript
│   └── uploads/           # Product images
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
└── README.md              # This file
```

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/change-password` - Change password
- `GET /api/auth/google` - Google OAuth

### Products
- `GET /api/products` - Get all products
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Orders
- `POST /api/orders` - Create order
- `GET /api/admin/orders` - Get all orders (admin)
- `PATCH /api/orders/:id/status` - Update order status (admin)
- `DELETE /api/orders/:id` - Delete order (admin)

### Admin
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/users` - Get all users (admin)
- `POST /api/admin/users` - Create admin user (admin)
- `PATCH /api/admin/users/:id/role` - Update user role (admin)

### Newsletter
- `POST /api/newsletter/subscribe` - Subscribe to newsletter
- `GET /api/newsletter/unsubscribe` - Unsubscribe from newsletter

## 🎨 Customization

### Styling
The project uses CSS custom properties for easy theming:
```css
:root {
    --color-gold: #ffd700;
    --color-pink: #ff6b6b;
    --color-teal: #4ecdc4;
    --color-dark: #0c0c0c;
    --color-light-dark: #1a1a2e;
    --color-space: #16213e;
}
```

### Adding New Features
1. **New Product Categories**: Add options in the admin form
2. **Custom Email Templates**: Modify email HTML in server.js
3. **Additional Payment Methods**: Extend the checkout system
4. **Analytics Integration**: Add tracking codes to index.html

## 📧 Email Configuration

### Gmail Setup
1. Enable 2-factor authentication
2. Generate an App Password
3. Use the App Password in EMAIL_PASS

### Anti-Spam Measures
- Professional email headers
- Rate limiting (14 emails/second)
- DKIM support (when configured)
- One-click unsubscribe compliance

## 🔧 Development

### Available Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run build      # Build for production (if applicable)
```

### Database Schema
- **Users**: Authentication and user management
- **Products**: Product catalog with images
- **Orders**: Order processing and tracking
- **NewsletterSubscribers**: Email marketing list

## 🚀 Deployment

### Heroku Deployment
1. Create Heroku app
2. Set environment variables
3. Deploy with Git:
   ```bash
   heroku create your-app-name
   heroku config:set MONGODB_URI=your-mongodb-uri
   git push heroku main
   ```

### Vercel Deployment
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Font Awesome** for beautiful icons
- **Google Fonts** for typography
- **AOS Library** for scroll animations
- **Nodemailer** for email functionality
- **MongoDB** for database management

## 📞 Support

For support and questions:
- **Email**: support@falakperfumes.com
- **GitHub Issues**: [Create an issue](https://github.com/yourusername/falak-perfumes/issues)
- **Documentation**: [Wiki](https://github.com/yourusername/falak-perfumes/wiki)

---

<div align="center">
  <p>Made with ❤️ and 🌟 by the Falak Perfumes Team</p>
  <p>Inspired by the cosmos, crafted for you.</p>
</div> 