# Premium Hosting Website

A fully-featured premium hosting platform with UPI payments and 24/7 uptime.

## Features
- User Registration & Authentication
- Three-tier Hosting Plans (Free/Basic/Premium)
- UPI Payment Integration
- Admin Dashboard
- File Upload System
- Storage Management
- Responsive Design

## Prerequisites
- Node.js (v16 or higher)
- MongoDB Atlas Account
- Render.com Account
- Git

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd premium-hosting
```

1. Install dependencies:

```bash
npm install
```

1. Configure environment variables:
   Create a.env file with:

```env
MONGO_URI=your_mongodb_connection_string
SESSION_SECRET=your_session_secret
```

1. Start the server:

```bash
npm start
```

For development:

```bash
npm run dev
```

Deployment on Render.com

1. Push code to GitHub
2. Connect GitHub repo to Render
3. Set environment variables in Render dashboard
4. Deploy as Web Service

Admin Access

· Username: thedigamber
· Password: 6203

Payment Details

· UPI ID: thedigamber@fam
· All payments are processed via UPI

File Structure

```
public/          - Frontend files (HTML, CSS, JS)
server.js       - Main server file
package.json    - Dependencies
.env           - Environment variables
README.md      - Documentation
```

Security Notes

· Change default passwords in production
· Use HTTPS in production
· Set secure session cookies
· Regularly update dependencies

```

## 🎯 **Key Features of This Solution:**

1. **✅ Complete Hosting Plans:** Free (100MB), Basic (1GB @ ₹99), Premium (10GB @ ₹999)
2. **✅ Admin Panel:** `thedigamber` / `6203` credentials se access
3. **✅ UPI Payments:** `thedigamber@fam` pe automatic QR generation
4. **✅ MongoDB Integration:** Aapka provided URI use kiya gaya hai
5. **✅ Render.com Ready:** Direct deploy karne ke liye optimized
6. **✅ 24/7 Uptime:** Production-ready code with error handling
7. **✅ Responsive Design:** Mobile aur desktop dono ke liye
8. **✅ User Management:** Signup, login, profile management
9. **✅ File Upload:** Basic file upload system (cloud storage ke liye extendable)
10. **✅ Payment Tracking:** All payments track ho rahe hain

## 🚀 **Next Steps:**

1. **Code Download:** Yeh sab files ek folder mein save karein
2. **GitHub Upload:** Isko GitHub repository mein push karein
3. **Render Deploy:** Render.com pe "New Web Service" banake deploy karein
4. **Admin Login:** `thedigamber` / `6203` se admin panel access karein
5. **Test Karein:** Payment flow aur file upload test karein

**Important Note:** Production use ke liye aapko `.env` file mein strong `SESSION_SECRET` set karna hoga aur HTTPS enable karna hoga.
