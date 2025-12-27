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
    secret: process.env.SESSION_SECRET || 'thedigamber-premium-hosting-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://crazyboy65889_db_user:Vcg0WjCc2jtYe0fq@thedigamber.ttrivue.mongodb.net/?retryWrites=true&w=majority&appName=theDigamber', {
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
        } else {
            // Update existing admin
            adminExists.isAdmin = true;
            await adminExists.save();
            console.log('✅ Admin user updated');
        }
    } catch (error) {
        console.error('❌ Admin initialization error:', error);
    }
}

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
            if (user && user.isAdmin) {
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

app.get('/*.html', (req, res) => {
    const page = req.path.replace('/', '').replace('.html', '');
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
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
        
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
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
        req.session.username = user.username;
        
        res.json({ 
            success: true, 
            message: 'Registration successful!',
            user: {
                id: user._id,
                username: user.username,
                plan: user.plan,
                isAdmin: user.isAdmin
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
        req.session.isAdmin = user.isAdmin;
        
        res.json({ 
            success: true, 
            message: 'Login successful!',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                isAdmin: user.isAdmin,
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
                isAdmin: user.isAdmin,
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
        const user = await User.findById(req.session.userId);
        
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }
            user.email = email;
        }
        
        await user.save();
        
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
        
        // Plan validation
        const plans = {
            'basic': { price: 99, storage: 1024 },
            'premium': { price: 999, storage: 10240 }
        };
        
        if (!plans[plan]) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        // Check if user already has this plan
        const user = await User.findById(req.session.userId);
        if (user.plan === plan) {
            return res.status(400).json({ error: `You already have the ${plan} plan` });
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
        
        if (!transactionId || transactionId.trim() === '') {
            return res.status(400).json({ error: 'Transaction ID is required' });
        }
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (payment.userId.toString() !== req.session.userId.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        if (payment.status === 'completed') {
            return res.status(400).json({ error: 'Payment already verified' });
        }
        
        // Update payment status
        payment.status = 'completed';
        payment.transactionId = transactionId;
        await payment.save();
        
        // Update user plan
        const user = await User.findById(req.session.userId);
        const plans = {
            'basic': 1024,
            'premium': 10240
        };
        
        user.plan = payment.plan;
        user.storageLimit = plans[payment.plan];
        user.planExpiry = new Date(+new Date() + 30*24*60*60*1000); // 30 days from now
        await user.save();
        
        res.json({
            success: true,
            message: 'Payment verified successfully! Plan upgraded.',
            plan: user.plan,
            storageLimit: user.storageLimit,
            planExpiry: user.planExpiry,
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
        const payments = await Payment.find({ userId: req.session.userId })
            .sort({ paymentDate: -1 })
            .limit(50);
        
        res.json({ success: true, payments });
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
        
        const user = await User.findById(req.session.userId);
        
        // Convert size from bytes to MB
        const sizeMB = size / (1024 * 1024);
        
        // Check storage limit
        const newStorageUsed = user.storageUsed + sizeMB;
        if (newStorageUsed > user.storageLimit) {
            return res.status(400).json({ 
                error: `Storage limit exceeded. You have ${user.storageLimit - user.storageUsed} MB left. Please upgrade your plan.` 
            });
        }
        
        // Update user storage
        user.storageUsed = newStorageUsed;
        await user.save();
        
        // Save file record
        const file = new File({
            userId: user._id,
            filename: filename,
            originalname: filename,
            size: size,
            fileType: fileType || 'unknown',
            filePath: `/uploads/${user._id}/${Date.now()}_${filename}`
        });
        
        await file.save();
        
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

// Get user's files
app.get('/api/user/files', requireAuth, async (req, res) => {
    try {
        const files = await File.find({ userId: req.session.userId })
            .sort({ uploadDate: -1 })
            .limit(100);
        
        res.json({ success: true, files });
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// Delete file
app.delete('/api/files/:id', requireAuth, async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            userId: req.session.userId 
        });
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Update user storage
        const user = await User.findById(req.session.userId);
        const sizeMB = file.size / (1024 * 1024);
        user.storageUsed = Math.max(0, user.storageUsed - sizeMB);
        await user.save();
        
        // Delete file record
        await File.deleteOne({ _id: req.params.id });
        
        res.json({
            success: true,
            message: 'File deleted successfully',
            storage: {
                used: user.storageUsed,
                limit: user.storageLimit,
                remaining: user.storageLimit - user.storageUsed
            }
        });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Admin Dashboard Data
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalFiles = await File.countDocuments();
        const totalPayments = await Payment.countDocuments();
        const completedPayments = await Payment.countDocuments({ status: 'completed' });
        
        const revenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const recentUsers = await User.find()
            .select('username email plan storageUsed storageLimit accountCreated planExpiry isAdmin')
            .sort({ accountCreated: -1 })
            .limit(10);
            
        const recentPayments = await Payment.find()
            .populate('userId', 'username email')
            .sort({ paymentDate: -1 })
            .limit(10);
        
        // Active plans count
        const activePlans = await User.countDocuments({ 
            plan: { $ne: 'free' },
            planExpiry: { $gt: new Date() }
        });
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                totalFiles,
                totalPayments,
                completedPayments,
                activePlans,
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

// Admin: Get all payments
app.get('/api/admin/payments', requireAdmin, async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate('userId', 'username email')
            .sort({ paymentDate: -1 })
            .limit(100);
        
        res.json({ success: true, payments });
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ error: 'Failed to get payments' });
    }
});

// Admin: Get all files
app.get('/api/admin/files', requireAdmin, async (req, res) => {
    try {
        const files = await File.find()
            .populate('userId', 'username email')
            .sort({ uploadDate: -1 })
            .limit(100);
        
        res.json({ success: true, files });
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// Admin: Update user
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const { plan, storageLimit, isAdmin } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent modifying the main admin
        if (user.username === 'thedigamber' && isAdmin === false) {
            return res.status(400).json({ error: 'Cannot remove main admin privileges' });
        }
        
        if (plan) {
            user.plan = plan;
            // Set storage limit based on plan
            if (plan === 'free') user.storageLimit = 100;
            else if (plan === 'basic') user.storageLimit = 1024;
            else if (plan === 'premium') user.storageLimit = 10240;
        }
        
        if (storageLimit) user.storageLimit = storageLimit;
        if (isAdmin !== undefined) user.isAdmin = isAdmin;
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'User updated successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                plan: user.plan,
                storageLimit: user.storageLimit,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Admin: Delete user
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent deleting the main admin
        if (user.username === 'thedigamber') {
            return res.status(400).json({ error: 'Cannot delete main admin' });
        }
        
        // Delete user's files
        await File.deleteMany({ userId: user._id });
        
        // Delete user's payments
        await Payment.deleteMany({ userId: user._id });
        
        // Delete user
        await User.deleteOne({ _id: user._id });
        
        res.json({ 
            success: true, 
            message: 'User deleted successfully' 
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Admin: Update payment status
app.put('/api/admin/payments/:id', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (!['pending', 'completed', 'failed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        payment.status = status;
        await payment.save();
        
        // If payment is marked as completed, update user's plan
        if (status === 'completed') {
            const user = await User.findById(payment.userId);
            if (user) {
                const plans = {
                    'basic': 1024,
                    'premium': 10240
                };
                
                user.plan = payment.plan;
                user.storageLimit = plans[payment.plan] || user.storageLimit;
                user.planExpiry = new Date(+new Date() + 30*24*60*60*1000);
                await user.save();
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Payment updated successfully',
            payment 
        });
    } catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({ error: 'Failed to update payment' });
    }
});

// Admin: Delete file
app.delete('/api/admin/files/:id', requireAdmin, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Update user's storage if user exists
        const user = await User.findById(file.userId);
        if (user) {
            const sizeMB = file.size / (1024 * 1024);
            user.storageUsed = Math.max(0, user.storageUsed - sizeMB);
            await user.save();
        }
        
        await File.deleteOne({ _id: req.params.id });
        
        res.json({ 
            success: true, 
            message: 'File deleted successfully' 
        });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Admin: System settings
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    const settings = {
        upiId: 'thedigamber@fam',
        businessName: 'Premium Hosting',
        basicPlanPrice: 99,
        premiumPlanPrice: 999,
        freePlanStorage: 100,
        basicPlanStorage: 1024,
        premiumPlanStorage: 10240,
        planValidityDays: 30,
        maxFileSize: 100, // MB
        supportEmail: 'support@premiumhost.com'
    };
    
    res.json({ success: true, settings });
});

// Admin: Update settings
app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const { 
            upiId, 
            basicPlanPrice, 
            premiumPlanPrice,
            supportEmail 
        } = req.body;
        
        // In production, save these to database
        // For now, just return success
        res.json({ 
            success: true, 
            message: 'Settings updated successfully (in memory)',
            updated: {
                upiId: upiId || 'thedigamber@fam',
                basicPlanPrice: basicPlanPrice || 99,
                premiumPlanPrice: premiumPlanPrice || 999,
                supportEmail: supportEmail || 'support@premiumhost.com'
            }
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Check storage
app.get('/api/storage', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const files = await File.find({ userId: user._id });
        const totalFiles = files.length;
        
        res.json({
            success: true,
            storage: {
                used: user.storageUsed,
                limit: user.storageLimit,
                remaining: user.storageLimit - user.storageUsed,
                percentage: ((user.storageUsed / user.storageLimit) * 100).toFixed(2)
            },
            files: {
                count: totalFiles,
                list: files.slice(0, 10) // Last 10 files
            }
        });
    } catch (error) {
        console.error('Storage check error:', error);
        res.status(500).json({ error: 'Failed to get storage info' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        memory: process.memoryUsage()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize admin user
    await initializeAdmin();
    
    console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    console.log(`🔐 Admin: thedigamber / 6203`);
    console.log(`💳 UPI: thedigamber@fam`);
});
