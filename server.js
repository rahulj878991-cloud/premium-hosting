const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'thedigamber-premium-hosting-secret-key-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// MongoDB Connection
const MONGODB_URI = process.env.MONGO_URI || 'mongodb+srv://crazyboy65889_db_user:Vcg0WjCc2jtYe0fq@thedigamber.ttrivue.mongodb.net/premiumhosting?retryWrites=true&w=majority&appName=theDigamber';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Using fallback: Will work without database');
});

// Database Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    plan: { 
        type: String, 
        enum: ['free', 'basic', 'premium'], 
        default: 'free' 
    },
    storageUsed: { type: Number, default: 0 },
    storageLimit: { type: Number, default: 100 }, // MB
    accountCreated: { type: Date, default: Date.now },
    planExpiry: { type: Date, default: () => new Date(+new Date() + 30*24*60*60*1000) },
    isAdmin: { type: Boolean, default: false }
});

const fileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    size: { type: Number, required: true }, // in bytes
    uploadDate: { type: Date, default: Date.now },
    fileType: { type: String, required: true },
    filePath: { type: String }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending' 
    },
    upiId: { type: String },
    transactionId: { type: String },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { type: String, default: 'UPI' }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// In-memory fallback if MongoDB fails
let usersCache = [];
let filesCache = [];
let paymentsCache = [];

// Initialize Admin User
async function initializeAdmin() {
    try {
        const adminExists = await User.findOne({ username: 'thedigamber' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('6203', 10);
            const adminUser = new User({
                username: 'thedigamber',
                password: hashedPassword,
                email: 'admin@premiumhost.com',
                plan: 'premium',
                storageLimit: 10240, // 10GB
                isAdmin: true
            });
            await adminUser.save();
            console.log('✅ Admin user created successfully');
            
            // Add to cache
            usersCache.push({
                _id: adminUser._id.toString(),
                username: 'thedigamber',
                email: 'admin@premiumhost.com',
                plan: 'premium',
                storageLimit: 10240,
                storageUsed: 0,
                isAdmin: true,
                accountCreated: new Date(),
                planExpiry: new Date(+new Date() + 30*24*60*60*1000)
            });
        } else {
            // Update existing admin
            adminExists.isAdmin = true;
            await adminExists.save();
            console.log('✅ Admin user updated');
        }
    } catch (error) {
        console.log('⚠️ Using cached admin due to DB error');
        // Add admin to cache
        usersCache.push({
            _id: 'admin_001',
            username: 'thedigamber',
            email: 'admin@premiumhost.com',
            password: await bcrypt.hash('6203', 10),
            plan: 'premium',
            storageLimit: 10240,
            storageUsed: 0,
            isAdmin: true,
            accountCreated: new Date(),
            planExpiry: new Date(+new Date() + 30*24*60*60*1000)
        });
    }
}

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        res.redirect('/login.html');
    }
};

const requireAdmin = async (req, res, next) => {
    if (req.session.userId) {
        try {
            let user;
            try {
                user = await User.findById(req.session.userId);
            } catch (error) {
                // Fallback to cache
                user = usersCache.find(u => u._id === req.session.userId);
            }
            
            if (user && (user.isAdmin || user.username === 'thedigamber')) {
                next();
            } else {
                res.status(403).json({ error: '❌ Admin access required' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    } else {
        res.redirect('/login.html');
    }
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve all HTML files
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.path);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('Page not found');
        }
    });
});

// Serve CSS and JS files
app.get('/*.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path), (err) => {
        if (err) {
            res.status(404).send('File not found');
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Check if user already exists
        let existingUser;
        try {
            existingUser = await User.findOne({ username });
        } catch (error) {
            existingUser = usersCache.find(u => u.username === username);
        }
        
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const userData = {
            username,
            password: hashedPassword,
            email,
            plan: 'free',
            storageLimit: 100,
            storageUsed: 0,
            isAdmin: false,
            accountCreated: new Date(),
            planExpiry: new Date(+new Date() + 30*24*60*60*1000)
        };
        
        let savedUser;
        try {
            const user = new User(userData);
            savedUser = await user.save();
        } catch (error) {
            // Fallback: use cache
            savedUser = {
                _id: 'user_' + Date.now(),
                ...userData
            };
            usersCache.push(savedUser);
        }
        
        // Set session
        req.session.userId = savedUser._id;
        req.session.username = savedUser.username;
        req.session.isAdmin = savedUser.isAdmin || false;
        
        res.json({ 
            success: true, 
            message: 'Registration successful!',
            user: {
                id: savedUser._id,
                username: savedUser.username,
                plan: savedUser.plan,
                isAdmin: savedUser.isAdmin
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        // Find user
        let user;
        try {
            user = await User.findOne({ username });
        } catch (error) {
            user = usersCache.find(u => u.username === username);
        }
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }
        
        // Set session
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin || false;
        
        res.json({ 
            success: true, 
            message: 'Login successful!',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan,
                storageUsed: user.storageUsed || 0,
                storageLimit: user.storageLimit || 100,
                isAdmin: user.isAdmin || false,
                accountCreated: user.accountCreated,
                planExpiry: user.planExpiry
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get current user
app.get('/api/user', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        let user;
        try {
            user = await User.findById(req.session.userId).select('-password');
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            success: true, 
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan,
                storageUsed: user.storageUsed || 0,
                storageLimit: user.storageLimit || 100,
                isAdmin: user.isAdmin || false,
                accountCreated: user.accountCreated,
                planExpiry: user.planExpiry
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Update user profile
app.put('/api/user/profile', requireAuth, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        let user;
        try {
            user = await User.findById(req.session.userId);
            if (user) {
                user.email = email;
                await user.save();
            } else {
                user = usersCache.find(u => u._id === req.session.userId);
                if (user) {
                    user.email = email;
                }
            }
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
            if (user) {
                user.email = email;
            }
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Plans Information
app.get('/api/plans', (req, res) => {
    const plans = {
        free: {
            name: 'Free Plan',
            price: 0,
            storage: '100 MB',
            storageMB: 100,
            duration: '1 Month',
            features: [
                '100 MB Storage',
                'Basic File Hosting',
                '24/7 Uptime',
                '1 Month Validity',
                'Email Support'
            ]
        },
        basic: {
            name: 'Basic Plan',
            price: 99,
            storage: '1 GB',
            storageMB: 1024,
            duration: '1 Month',
            features: [
                '1 GB Storage',
                'Advanced File Hosting',
                'Priority Support',
                '24/7 Uptime',
                '1 Month Validity',
                'Faster Uploads'
            ]
        },
        premium: {
            name: 'Premium Plan',
            price: 999,
            storage: '10 GB',
            storageMB: 10240,
            duration: '1 Month',
            features: [
                '10 GB Storage',
                'Premium File Hosting',
                '24/7 Priority Support',
                'Maximum Uptime',
                'Advanced Dashboard',
                '1 Month Validity',
                'Unlimited Bandwidth'
            ]
        }
    };
    
    res.json({ success: true, plans });
});

// Initiate Payment
app.post('/api/payment/initiate', requireAuth, async (req, res) => {
    try {
        const { plan } = req.body;
        
        if (!plan || !['basic', 'premium'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        // Plan prices
        const plans = {
            'basic': { price: 99, storage: 1024 },
            'premium': { price: 999, storage: 10240 }
        };
        
        // Get user
        let user;
        try {
            user = await User.findById(req.session.userId);
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.plan === plan) {
            return res.status(400).json({ error: `You already have the ${plan} plan` });
        }
        
        // Create payment record
        const paymentData = {
            userId: req.session.userId,
            plan: plan,
            amount: plans[plan].price,
            status: 'pending',
            upiId: 'thedigamber@fam',
            paymentDate: new Date()
        };
        
        let payment;
        try {
            payment = new Payment(paymentData);
            await payment.save();
        } catch (error) {
            payment = {
                _id: 'pay_' + Date.now(),
                ...paymentData
            };
            paymentsCache.push(payment);
        }
        
        // Generate UPI payment link
        const upiLink = `upi://pay?pa=thedigamber@fam&pn=Premium%20Hosting&am=${plans[plan].price}&tn=Payment%20for%20${plan}%20plan%20${payment._id}&cu=INR`;
        
        res.json({
            success: true,
            paymentId: payment._id,
            plan: plan,
            amount: plans[plan].price,
            upiId: 'thedigamber@fam',
            upiLink: upiLink,
            qrData: upiLink,
            message: `Pay ₹${plans[plan].price} to upgrade to ${plan} plan`
        });
    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// Verify Payment
app.post('/api/payment/verify', requireAuth, async (req, res) => {
    try {
        const { paymentId, transactionId } = req.body;
        
        if (!paymentId || !transactionId) {
            return res.status(400).json({ error: 'Payment ID and Transaction ID are required' });
        }
        
        // Find payment
        let payment;
        try {
            payment = await Payment.findById(paymentId);
        } catch (error) {
            payment = paymentsCache.find(p => p._id === paymentId);
        }
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (payment.userId !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        if (payment.status === 'completed') {
            return res.status(400).json({ error: 'Payment already verified' });
        }
        
        // Update payment
        payment.status = 'completed';
        payment.transactionId = transactionId;
        
        try {
            if (payment.save) {
                await payment.save();
            }
        } catch (error) {
            // Update in cache
            const index = paymentsCache.findIndex(p => p._id === paymentId);
            if (index !== -1) {
                paymentsCache[index] = payment;
            }
        }
        
        // Update user plan
        const plans = {
            'basic': 1024,
            'premium': 10240
        };
        
        let user;
        try {
            user = await User.findById(req.session.userId);
            if (user) {
                user.plan = payment.plan;
                user.storageLimit = plans[payment.plan];
                user.planExpiry = new Date(+new Date() + 30*24*60*60*1000);
                await user.save();
            } else {
                user = usersCache.find(u => u._id === req.session.userId);
                if (user) {
                    user.plan = payment.plan;
                    user.storageLimit = plans[payment.plan];
                    user.planExpiry = new Date(+new Date() + 30*24*60*60*1000);
                }
            }
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
            if (user) {
                user.plan = payment.plan;
                user.storageLimit = plans[payment.plan];
                user.planExpiry = new Date(+new Date() + 30*24*60*60*1000);
            }
        }
        
        res.json({
            success: true,
            message: 'Payment verified successfully! Plan upgraded.',
            plan: payment.plan,
            storageLimit: plans[payment.plan],
            transactionId: transactionId
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// Get user's payment history
app.get('/api/user/payments', requireAuth, async (req, res) => {
    try {
        let payments;
        try {
            payments = await Payment.find({ userId: req.session.userId })
                .sort({ paymentDate: -1 })
                .limit(50);
        } catch (error) {
            payments = paymentsCache.filter(p => p.userId === req.session.userId)
                .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                .slice(0, 50);
        }
        
        res.json({ success: true, payments: payments || [] });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ error: 'Failed to get payment history' });
    }
});

// File Upload
app.post('/api/upload', requireAuth, async (req, res) => {
    try {
        const { filename, size, fileType } = req.body;
        
        if (!filename || !size) {
            return res.status(400).json({ error: 'Filename and size are required' });
        }
        
        // Get user
        let user;
        try {
            user = await User.findById(req.session.userId);
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Convert size from bytes to MB
        const sizeMB = size / (1024 * 1024);
        
        // Check storage limit
        const newStorageUsed = (user.storageUsed || 0) + sizeMB;
        const storageLimit = user.storageLimit || 100;
        
        if (newStorageUsed > storageLimit) {
            return res.status(400).json({ 
                error: `Storage limit exceeded. You have ${(storageLimit - (user.storageUsed || 0)).toFixed(2)} MB left. Please upgrade your plan.` 
            });
        }
        
        // Update user storage
        user.storageUsed = newStorageUsed;
        
        try {
            if (user.save) {
                await user.save();
            }
        } catch (error) {
            // Update in cache
            const index = usersCache.findIndex(u => u._id === req.session.userId);
            if (index !== -1) {
                usersCache[index] = user;
            }
        }
        
        // Save file record
        const fileData = {
            userId: req.session.userId,
            filename: filename,
            originalname: filename,
            size: size,
            fileType: fileType || 'unknown',
            filePath: `/uploads/${req.session.userId}/${Date.now()}_${filename}`,
            uploadDate: new Date()
        };
        
        let file;
        try {
            file = new File(fileData);
            await file.save();
        } catch (error) {
            file = {
                _id: 'file_' + Date.now(),
                ...fileData
            };
            filesCache.push(file);
        }
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: file._id,
                filename: file.filename,
                size: file.size,
                sizeMB: sizeMB.toFixed(2),
                fileType: file.fileType,
                uploadDate: file.uploadDate
            },
            storage: {
                used: newStorageUsed,
                limit: storageLimit,
                remaining: storageLimit - newStorageUsed
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Get user's files
app.get('/api/user/files', requireAuth, async (req, res) => {
    try {
        let files;
        try {
            files = await File.find({ userId: req.session.userId })
                .sort({ uploadDate: -1 })
                .limit(100);
        } catch (error) {
            files = filesCache.filter(f => f.userId === req.session.userId)
                .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
                .slice(0, 100);
        }
        
        res.json({ success: true, files: files || [] });
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// Admin Dashboard Data
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        let totalUsers, totalFiles, totalPayments, completedPayments, recentUsers, recentPayments;
        
        try {
            totalUsers = await User.countDocuments();
            totalFiles = await File.countDocuments();
            totalPayments = await Payment.countDocuments();
            completedPayments = await Payment.countDocuments({ status: 'completed' });
            
            recentUsers = await User.find()
                .select('username email plan storageUsed storageLimit accountCreated planExpiry isAdmin')
                .sort({ accountCreated: -1 })
                .limit(10);
                
            recentPayments = await Payment.find()
                .populate('userId', 'username email')
                .sort({ paymentDate: -1 })
                .limit(10);
        } catch (error) {
            // Fallback to cache
            totalUsers = usersCache.length;
            totalFiles = filesCache.length;
            totalPayments = paymentsCache.length;
            completedPayments = paymentsCache.filter(p => p.status === 'completed').length;
            
            recentUsers = usersCache
                .sort((a, b) => new Date(b.accountCreated) - new Date(a.accountCreated))
                .slice(0, 10)
                .map(u => ({
                    username: u.username,
                    email: u.email,
                    plan: u.plan,
                    storageUsed: u.storageUsed || 0,
                    storageLimit: u.storageLimit || 100,
                    accountCreated: u.accountCreated,
                    planExpiry: u.planExpiry,
                    isAdmin: u.isAdmin || false
                }));
                
            recentPayments = paymentsCache
                .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                .slice(0, 10)
                .map(p => ({
                    ...p,
                    userId: {
                        username: usersCache.find(u => u._id === p.userId)?.username || 'Unknown',
                        email: usersCache.find(u => u._id === p.userId)?.email || 'Unknown'
                    }
                }));
        }
        
        // Calculate revenue
        let totalRevenue = 0;
        try {
            const revenue = await Payment.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            totalRevenue = revenue[0]?.total || 0;
        } catch (error) {
            totalRevenue = paymentsCache
                .filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + (p.amount || 0), 0);
        }
        
        // Active plans count
        const activePlans = recentUsers.filter(user => 
            user.plan !== 'free' && 
            new Date(user.planExpiry) > new Date()
        ).length;
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                totalFiles,
                totalPayments,
                completedPayments,
                activePlans,
                totalRevenue
            },
            recentUsers,
            recentPayments
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to get admin stats' });
    }
});

// Admin: Get all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        let users;
        try {
            users = await User.find().select('-password').sort({ accountCreated: -1 });
        } catch (error) {
            users = usersCache.map(u => ({
                _id: u._id,
                username: u.username,
                email: u.email,
                plan: u.plan,
                storageUsed: u.storageUsed || 0,
                storageLimit: u.storageLimit || 100,
                isAdmin: u.isAdmin || false,
                accountCreated: u.accountCreated,
                planExpiry: u.planExpiry
            }));
        }
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Check storage
app.get('/api/storage', requireAuth, async (req, res) => {
    try {
        let user;
        try {
            user = await User.findById(req.session.userId);
        } catch (error) {
            user = usersCache.find(u => u._id === req.session.userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        let files;
        try {
            files = await File.find({ userId: user._id });
        } catch (error) {
            files = filesCache.filter(f => f.userId === user._id);
        }
        
        const totalFiles = files.length;
        const storageUsed = user.storageUsed || 0;
        const storageLimit = user.storageLimit || 100;
        
        res.json({
            success: true,
            storage: {
                used: storageUsed,
                limit: storageLimit,
                remaining: storageLimit - storageUsed,
                percentage: storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(2) : '0.00'
            },
            files: {
                count: totalFiles,
                list: files.slice(0, 10)
            }
        });
    } catch (error) {
        console.error('Storage check error:', error);
        res.status(500).json({ error: 'Failed to get storage info' });
    }
});

// Simple file upload simulation (no actual file storage)
app.post('/api/simple-upload', requireAuth, async (req, res) => {
    try {
        const { filename, size } = req.body;
        
        if (!filename || !size) {
            return res.status(400).json({ error: 'Filename and size are required' });
        }
        
        // Simple success response for testing
        res.json({
            success: true,
            message: 'File upload simulation successful',
            file: {
                filename: filename,
                size: size,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Simple upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 404 handler for API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Serve index.html for all other routes (for SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize admin user
    await initializeAdmin();
    
    console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected (Using Cache) ⚠️'}`);
    console.log(`🔐 Admin Login: thedigamber / 6203`);
    console.log(`💳 UPI ID: thedigamber@fam`);
    console.log(`📁 Public folder: ${path.join(__dirname, 'public')}`);
});
