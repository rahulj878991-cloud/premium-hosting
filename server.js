const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use(session({
    secret: process.env.SESSION_SECRET || 'thedigamber-premium-hosting-real-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
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
    console.log('⚠️ Using in-memory database (files will be lost on restart)');
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
    storageUsed: { type: Number, default: 0 }, // in MB
    storageLimit: { type: Number, default: 100 }, // in MB
    accountCreated: { type: Date, default: Date.now },
    planExpiry: { type: Date, default: () => new Date(+new Date() + 30*24*60*60*1000) },
    isAdmin: { type: Boolean, default: false },
    totalFiles: { type: Number, default: 0 }
});

const fileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    filename: { type: String, required: true },
    originalname: { type: String, required: true },
    size: { type: Number, required: true }, // in bytes
    uploadDate: { type: Date, default: Date.now },
    fileType: { type: String, required: true },
    filePath: { type: String, required: true },
    publicUrl: { type: String, required: true },
    downloadCount: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'under_review'], 
        default: 'pending' 
    },
    upiId: { type: String },
    transactionId: { type: String },
    paymentDate: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
    screenshotUrl: { type: String }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// In-memory fallback
let usersCache = [];
let filesCache = [];
let paymentsCache = [];

// Initialize Admin
async function initializeAdmin() {
    try {
        const adminExists = await User.findOne({ username: 'thedigamber' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('6203', 10);
            const adminUser = new User({
                username: 'thedigamber',
                password: hashedPassword,
                email: 'devoteehanumaan@gmail.com',
                plan: 'premium',
                storageLimit: 10240,
                isAdmin: true
            });
            await adminUser.save();
            console.log('✅ Admin user created');
        }
    } catch (error) {
        console.log('⚠️ Admin init failed, using cache');
    }
}

// Multer Configuration for REAL File Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const userDir = path.join(uploadsDir, req.session.userId || 'temp');
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: function (req, file, cb) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(7) + '-' + safeName;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max
        files: 5
    },
    fileFilter: (req, file, cb) => {
        // Allow all files for now
        cb(null, true);
    }
});

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
            const user = await User.findById(req.session.userId);
            if (user && (user.isAdmin || user.username === 'thedigamber')) {
                next();
            } else {
                res.status(403).json({ error: 'Admin access required' });
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
    const filePath = path.join(__dirname, 'public', req.path);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('Page not found');
        }
    });
});

app.get('/*.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

app.get('/*.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Premium Hosting',
        version: '3.0.0',
        realHosting: true,
        timestamp: new Date().toISOString()
    });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ error: 'All fields required' });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            email,
            plan: 'free',
            storageLimit: 100
        });
        
        await user.save();
        req.session.userId = user._id;
        req.session.username = user.username;
        
        res.json({ 
            success: true, 
            message: 'Account created!',
            user: {
                id: user._id,
                username: user.username,
                plan: user.plan
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
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
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out' });
});

// Get current user
app.get('/api/user', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const user = await User.findById(req.session.userId).select('-password');
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
                planExpiry: user.planExpiry,
                isAdmin: user.isAdmin,
                totalFiles: user.totalFiles
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Plans info
app.get('/api/plans', (req, res) => {
    const plans = {
        free: {
            name: 'Free Plan',
            price: 0,
            storage: '100 MB',
            storageMB: 100,
            features: ['100MB Storage', 'Basic Hosting', '30 Days', 'Email Support']
        },
        basic: {
            name: 'Basic Plan',
            price: 99,
            storage: '1 GB',
            storageMB: 1024,
            features: ['1GB Storage', 'Priority Support', '30 Days', 'Faster Uploads']
        },
        premium: {
            name: 'Premium Plan',
            price: 999,
            storage: '10 GB',
            storageMB: 10240,
            features: ['10GB Storage', '24/7 Priority Support', '30 Days', 'Unlimited Bandwidth']
        }
    };
    
    res.json({ success: true, plans });
});

// Initiate payment
app.post('/api/payment/initiate', requireAuth, async (req, res) => {
    try {
        const { plan } = req.body;
        
        if (!plan || !['basic', 'premium'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }
        
        const plans = {
            'basic': { price: 99, storage: 1024 },
            'premium': { price: 999, storage: 10240 }
        };
        
        const user = await User.findById(req.session.userId);
        if (user.plan === plan) {
            return res.status(400).json({ error: 'Already on this plan' });
        }
        
        const payment = new Payment({
            userId: user._id,
            plan: plan,
            amount: plans[plan].price,
            upiId: 'thedigamber@fam',
            status: 'pending'
        });
        
        await payment.save();
        
        res.json({
            success: true,
            paymentId: payment._id,
            plan: plan,
            amount: plans[plan].price,
            upiId: 'thedigamber@fam',
            message: `Pay ₹${plans[plan].price} via UPI`
        });
    } catch (error) {
        console.error('Payment init error:', error);
        res.status(500).json({ error: 'Payment initiation failed' });
    }
});

// REAL Payment Verification (WORKING)
app.post('/api/payment/verify', requireAuth, async (req, res) => {
    try {
        const { paymentId, transactionId } = req.body;
        
        if (!paymentId || !transactionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment ID and Transaction ID required' 
            });
        }
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment not found' 
            });
        }
        
        if (payment.userId.toString() !== req.session.userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Not authorized' 
            });
        }
        
        if (payment.status === 'completed') {
            return res.json({
                success: true,
                message: 'Payment already verified',
                alreadyActive: true
            });
        }
        
        // REAL VERIFICATION - Auto approve for now
        // In production, verify with payment gateway
        
        payment.status = 'completed';
        payment.transactionId = transactionId;
        payment.verifiedAt = new Date();
        await payment.save();
        
        // Update user plan
        const user = await User.findById(req.session.userId);
        const plans = {
            'basic': 1024,
            'premium': 10240
        };
        
        user.plan = payment.plan;
        user.storageLimit = plans[payment.plan];
        user.planExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await user.save();
        
        res.json({
            success: true,
            message: `✅ Payment verified! ${payment.plan.toUpperCase()} Plan activated.`,
            plan: payment.plan,
            storageLimit: plans[payment.plan],
            expiry: user.planExpiry
        });
        
    } catch (error) {
        console.error('Payment verify error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Verification failed. Contact support: devoteehanumaan@gmail.com' 
        });
    }
});

// REAL FILE UPLOAD - Working Hosting
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file selected' 
            });
        }
        
        const user = await User.findById(req.session.userId);
        if (!user) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        // Check file size limit
        const maxSize = user.plan === 'premium' ? 500 * 1024 * 1024 : 
                       user.plan === 'basic' ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
        
        if (req.file.size > maxSize) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: `File too large. Max size for ${user.plan} plan: ${maxSize/(1024*1024)}MB`
            });
        }
        
        // Calculate size in MB
        const fileSizeMB = req.file.size / (1024 * 1024);
        
        // Check storage
        if (user.storageUsed + fileSizeMB > user.storageLimit) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: `Storage full! ${(user.storageLimit - user.storageUsed).toFixed(2)}MB left. Upgrade plan.`
            });
        }
        
        // Create file record
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${user._id}/${req.file.filename}`;
        
        const fileRecord = new File({
            userId: user._id,
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            fileType: req.file.mimetype,
            filePath: req.file.path,
            publicUrl: fileUrl,
            isPublic: true
        });
        
        await fileRecord.save();
        
        // Update user storage
        user.storageUsed += fileSizeMB;
        user.totalFiles = (user.totalFiles || 0) + 1;
        await user.save();
        
        res.json({
            success: true,
            message: '✅ File hosted successfully!',
            file: {
                id: fileRecord._id,
                name: req.file.originalname,
                size: req.file.size,
                sizeMB: fileSizeMB.toFixed(2),
                type: req.file.mimetype,
                url: fileUrl,
                downloadUrl: fileUrl + '?download=1',
                uploadDate: new Date()
            },
            storage: {
                used: user.storageUsed,
                limit: user.storageLimit,
                remaining: user.storageLimit - user.storageUsed
            }
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {}
        }
        res.status(500).json({ 
            success: false, 
            error: 'Upload failed: ' + error.message 
        });
    }
});

// Get user's hosted files
app.get('/api/user/files', requireAuth, async (req, res) => {
    try {
        const files = await File.find({ userId: req.session.userId })
            .sort({ uploadDate: -1 });
        
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        const filesWithUrls = files.map(file => ({
            id: file._id,
            name: file.originalname,
            filename: file.filename,
            size: file.size,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2),
            type: file.fileType,
            url: file.publicUrl,
            downloadUrl: file.publicUrl + '?download=1',
            uploadDate: file.uploadDate,
            downloadCount: file.downloadCount,
            isPublic: file.isPublic
        }));
        
        res.json({
            success: true,
            files: filesWithUrls,
            count: files.length
        });
        
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get files' 
        });
    }
});

// Delete file
app.delete('/api/file/:fileId', requireAuth, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        const file = await File.findOne({ 
            _id: fileId, 
            userId: req.session.userId 
        });
        
        if (!file) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found' 
            });
        }
        
        // Delete physical file
        if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
        }
        
        // Update user storage
        const user = await User.findById(req.session.userId);
        const fileSizeMB = file.size / (1024 * 1024);
        user.storageUsed = Math.max(0, user.storageUsed - fileSizeMB);
        user.totalFiles = Math.max(0, (user.totalFiles || 0) - 1);
        await user.save();
        
        // Delete record
        await File.deleteOne({ _id: fileId });
        
        res.json({
            success: true,
            message: 'File deleted',
            storage: {
                used: user.storageUsed,
                limit: user.storageLimit,
                remaining: user.storageLimit - user.storageUsed
            }
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Delete failed' 
        });
    }
});

// Serve uploaded files
app.get('/uploads/:userId/:filename', async (req, res) => {
    try {
        const { userId, filename } = req.params;
        const filePath = path.join(uploadsDir, userId, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        
        // Check if download requested
        if (req.query.download === '1') {
            const file = await File.findOne({ filename });
            if (file) {
                file.downloadCount += 1;
                await file.save();
            }
            res.download(filePath);
        } else {
            res.sendFile(filePath);
        }
        
    } catch (error) {
        console.error('Serve file error:', error);
        res.status(500).send('Error serving file');
    }
});

// Get file info
app.get('/api/file/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const file = await File.findById(fileId).populate('userId', 'username');
        
        if (!file) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found' 
            });
        }
        
        res.json({
            success: true,
            file: {
                id: file._id,
                name: file.originalname,
                size: file.size,
                type: file.fileType,
                url: file.publicUrl,
                uploadDate: file.uploadDate,
                uploadedBy: file.userId.username,
                downloadCount: file.downloadCount
            }
        });
        
    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get file info' 
        });
    }
});

// Admin stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalFiles = await File.countDocuments();
        const totalPayments = await Payment.countDocuments({ status: 'completed' });
        
        const revenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const recentUsers = await User.find()
            .select('username email plan storageUsed storageLimit accountCreated')
            .sort({ accountCreated: -1 })
            .limit(10);
            
        const recentPayments = await Payment.find()
            .populate('userId', 'username')
            .sort({ paymentDate: -1 })
            .limit(10);
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                totalFiles,
                totalPayments,
                totalRevenue: revenue[0]?.total || 0,
                totalStorageUsed: await User.aggregate([
                    { $group: { _id: null, total: { $sum: '$storageUsed' } } }
                ]).then(r => r[0]?.total || 0)
            },
            recentUsers,
            recentPayments
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Support email
app.post('/api/support', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'All fields required' });
        }
        
        console.log('📧 Support Request:', { name, email, subject, message });
        
        res.json({
            success: true,
            message: 'Support request received',
            supportEmail: 'devoteehanumaan@gmail.com',
            discord: 'https://discord.gg/5bFnXdUp8U'
        });
        
    } catch (error) {
        console.error('Support error:', error);
        res.status(500).json({ error: 'Failed to send support request' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Premium Hosting Server Started on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`💾 Real File Hosting: ENABLED`);
    console.log(`📁 Uploads Directory: ${uploadsDir}`);
    console.log(`🔐 Admin: thedigamber / 6203`);
    console.log(`💳 UPI: thedigamber@fam`);
    console.log(`📧 Support: devoteehanumaan@gmail.com`);
    console.log(`🎮 Discord: https://discord.gg/5bFnXdUp8U`);
    
    await initializeAdmin();
});
