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
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Render pe true karna
}));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'your-mongodb-uri-here', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

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
    planExpiry: { type: Date, default: () => new Date(+new Date() + 30*24*60*60*1000) }
});

const fileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    size: { type: Number, required: true }, // in bytes
    uploadDate: { type: Date, default: Date.now },
    fileType: { type: String, required: true }
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
    paymentDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

const requireAdmin = async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            if (user && user.username === 'thedigamber') {
                next();
            } else {
                res.status(403).send('❌ Admin access required');
            }
        } catch (error) {
            res.status(500).send('Server error');
        }
    } else {
        res.redirect('/login.html');
    }
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = new User({
            username,
            password: hashedPassword,
            email,
            plan: 'free',
            storageLimit: 100 // 100MB for free plan
        });
        
        await user.save();
        
        // Set session
        req.session.userId = user._id;
        
        res.json({ 
            success: true, 
            message: 'Registration successful!',
            user: {
                id: user._id,
                username: user.username,
                plan: user.plan
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Set session
        req.session.userId = user._id;
        
        res.json({ 
            success: true, 
            message: 'Login successful!',
            user: {
                id: user._id,
                username: user.username,
                plan: user.plan,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy(err => {
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
        
        const user = await User.findById(req.session.userId)
            .select('-password');
        
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
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                accountCreated: user.accountCreated,
                planExpiry: user.planExpiry
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Plans Information
app.get('/api/plans', (req, res) => {
    const plans = {
        free: {
            name: 'Free Plan',
            price: 0,
            storage: '100 MB',
            duration: '1 Month',
            features: [
                '100 MB Storage',
                'Basic File Hosting',
                '24/7 Uptime',
                '1 Month Validity'
            ]
        },
        basic: {
            name: 'Basic Plan',
            price: 99,
            storage: '1 GB',
            duration: '1 Month',
            features: [
                '1 GB Storage',
                'Advanced File Hosting',
                'Priority Support',
                '24/7 Uptime',
                '1 Month Validity'
            ]
        },
        premium: {
            name: 'Premium Plan',
            price: 999,
            storage: '10 GB',
            duration: '1 Month',
            features: [
                '10 GB Storage',
                'Premium File Hosting',
                '24/7 Priority Support',
                'Maximum Uptime',
                'Advanced Dashboard',
                '1 Month Validity'
            ]
        }
    };
    
    res.json({ success: true, plans });
});

// Initiate Payment
app.post('/api/payment/initiate', requireAuth, async (req, res) => {
    try {
        const { plan } = req.body;
        
        // Plan validation
        const plans = {
            'basic': { price: 99, storage: 1024 }, // 1GB in MB
            'premium': { price: 999, storage: 10240 } // 10GB in MB
        };
        
        if (!plans[plan]) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        // Create payment record
        const payment = new Payment({
            userId: req.session.userId,
            plan: plan,
            amount: plans[plan].price,
            status: 'pending',
            upiId: 'thedigamber@fam'
        });
        
        await payment.save();
        
        // Generate UPI payment link
        const upiLink = `upi://pay?pa=thedigamber@fam&pn=Premium Hosting&am=${plans[plan].price}&tn=Payment for ${plan} plan - ${payment._id}&cu=INR`;
        
        res.json({
            success: true,
            paymentId: payment._id,
            plan: plan,
            amount: plans[plan].price,
            upiId: 'thedigamber@fam',
            upiLink: upiLink,
            qrData: `upi://pay?pa=thedigamber@fam&pn=Premium Hosting&am=${plans[plan].price}&tn=Payment for ${plan} plan - ${payment._id}&cu=INR`
        });
    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// Verify Payment (Manual for UPI)
app.post('/api/payment/verify', requireAuth, async (req, res) => {
    try {
        const { paymentId, transactionId } = req.body;
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (payment.userId.toString() !== req.session.userId.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        // Update payment status
        payment.status = 'completed';
        payment.transactionId = transactionId;
        await payment.save();
        
        // Update user plan
        const user = await User.findById(req.session.userId);
        const plans = {
            'basic': 1024, // 1GB
            'premium': 10240 // 10GB
        };
        
        user.plan = payment.plan;
        user.storageLimit = plans[payment.plan];
        user.planExpiry = new Date(+new Date() + 30*24*60*60*1000); // 30 days
        await user.save();
        
        res.json({
            success: true,
            message: 'Payment verified successfully!',
            plan: user.plan,
            storageLimit: user.storageLimit,
            planExpiry: user.planExpiry
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// Admin Dashboard Data
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalFiles = await File.countDocuments();
        const totalPayments = await Payment.countDocuments();
        const revenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const recentUsers = await User.find()
            .select('username email plan storageUsed storageLimit accountCreated')
            .sort({ accountCreated: -1 })
            .limit(10);
            
        const recentPayments = await Payment.find()
            .populate('userId', 'username email')
            .sort({ paymentDate: -1 })
            .limit(10);
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                totalFiles,
                totalPayments,
                totalRevenue: revenue[0]?.total || 0
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
        const users = await User.find()
            .select('-password')
            .sort({ accountCreated: -1 });
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Admin: Update user
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const { plan, storageLimit } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (plan) user.plan = plan;
        if (storageLimit) user.storageLimit = storageLimit;
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'User updated successfully',
            user: {
                id: user._id,
                username: user.username,
                plan: user.plan,
                storageLimit: user.storageLimit
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// File Upload (Basic Example)
// Note: For production, use multer for file handling and store files in cloud storage
app.post('/api/upload', requireAuth, async (req, res) => {
    try {
        // This is a simplified version
        // In production, you would use multer for file handling
        // and store files in cloud storage (AWS S3, etc.)
        
        const { filename, size } = req.body; // In real app, use multer
        
        const user = await User.findById(req.session.userId);
        
        // Check storage limit
        const newSize = user.storageUsed + (size || 0);
        if (newSize > user.storageLimit) {
            return res.status(400).json({ 
                error: 'Storage limit exceeded. Please upgrade your plan.' 
            });
        }
        
        // Update user storage
        user.storageUsed = newSize;
        await user.save();
        
        // Save file record
        const file = new File({
            userId: user._id,
            filename: filename || `file_${Date.now()}`,
            originalname: filename || 'uploaded_file',
            size: size || 0,
            fileType: 'unknown'
        });
        
        await file.save();
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: file._id,
                filename: file.filename,
                size: file.size,
                uploadDate: file.uploadDate
            },
            storage: {
                used: user.storageUsed,
                limit: user.storageLimit,
                remaining: user.storageLimit - user.storageUsed
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Serve HTML files
app.get('/*.html', (req, res) => {
    const page = req.path.replace('/', '').replace('.html', '');
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
});
