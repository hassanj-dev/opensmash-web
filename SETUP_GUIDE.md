# 🚀 Complete Setup & Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Application Configuration](#application-configuration)
4. [Database Schema Setup](#database-schema-setup)
5. [Creating Super Admin Account](#creating-super-admin-account)
6. [Running the Application](#running-the-application)
7. [Testing Guide](#testing-guide)
8. [Deployment to Production](#deployment-to-production)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:
- ✅ Node.js 18.x or higher installed
- ✅ npm or yarn package manager
- ✅ A code editor (VS Code recommended)
- ✅ Git installed (optional, for version control)
- ✅ A Supabase account (free tier is sufficient)

---

## Supabase Setup

### Step 1: Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **"Start your project"** or **"New Project"**
3. Choose your organization or create a new one
4. Fill in project details:
   - **Name**: `irongym-saas` (or your preferred name)
   - **Database Password**: Generate a strong password and **save it securely**
   - **Region**: Choose the closest region to your users
5. Click **"Create new project"**
6. Wait 2-3 minutes for your project to be provisioned

### Step 2: Get Your API Keys

1. Once your project is ready, go to **Settings** (gear icon in sidebar)
2. Click **API** in the left menu
3. You'll see these values:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string)
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (different long string)

⚠️ **IMPORTANT**: Copy these values - you'll need them in the next step!

### Step 3: Configure Email Settings (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize the email templates if desired
3. For production, configure a custom SMTP provider:
   - Go to **Settings** → **Authentication**
   - Scroll to **SMTP Settings**
   - Configure your email provider (SendGrid, AWS SES, etc.)

---

## Application Configuration

### Step 1: Install Dependencies

Open your terminal in the `gym-saas-web` folder:

```bash
cd gym-saas-web
npm install
```

### Step 2: Configure Environment Variables

1. Create a `.env.local` file in the root of `gym-saas-web` folder
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Replace the placeholder values with your actual Supabase credentials

⚠️ **Security Warning**:
- Never commit `.env.local` to Git
- Never share your service role key publicly
- Add `.env.local` to your `.gitignore` file

---

## Database Schema Setup

### Step 1: Open SQL Editor

1. In your Supabase dashboard, click **SQL Editor** (icon looks like `</>`)
2. Click **New Query** button

### Step 2: Run the Complete Schema

1. Open the file `supabase-schema.sql` in your code editor
2. Copy the **entire contents** of the file (Ctrl+A, Ctrl+C)
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

You should see: ✅ **Success. No rows returned**

This will create:
- All database tables (gyms, users, members, payments, etc.)
- All indexes for performance
- Row Level Security (RLS) policies
- Helper functions
- Automatic triggers (member code, receipt number generation)

### Step 3: Verify Tables Were Created

1. Click on **Table Editor** (icon looks like a table)
2. You should see these tables in the left sidebar:
   - gyms
   - users
   - members
   - plans
   - payments
   - attendance
   - expenses
   - audit_log
   - settings

If you see all these tables, the schema was successfully created! ✅

---

## Creating Super Admin Account

### Method 1: Using Supabase Dashboard (Recommended)

#### Step 1: Create Auth User

1. Go to **Authentication** → **Users** in Supabase
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email**: Your admin email (e.g., `admin@yourdomain.com`)
   - **Password**: Your secure admin password
   - **Auto Confirm User**: ✅ Check this box (so you don't need email confirmation)
4. Click **Create user**
5. **Copy the User ID (UUID)** - you'll need it in the next step

#### Step 2: Add User to Users Table

1. Go back to **SQL Editor**
2. Create a new query
3. Run this SQL (replace `YOUR_USER_ID` with the UUID you copied):

```sql
-- Replace these values with your actual data
INSERT INTO users (id, email, full_name, role, is_active, gym_id)
VALUES (
  'b2d430de-0b13-4220-b6f6-64a3f3e67507',  -- The UUID from step 1
  'hassanjss27@gmail.com',  -- Your email
  'Hassan',  -- Your name
  'super_admin',  -- Role (don't change this)
  true,  -- Active status
  NULL  -- Super admins don't belong to a gym
);
```

4. Click **Run**

You should see: ✅ **Success. Inserted 1 row.**

### Method 2: Using Application Sign Up (For Testing Only)

If you want to test the sign-up flow first:

1. Run the application (see next section)
2. Sign up normally with gym details
3. Then manually change the user's role in Supabase:

```sql
UPDATE users
SET role = 'super_admin', gym_id = NULL
WHERE email = 'your-signup-email@example.com';
```

---

## Running the Application

### Step 1: Start Development Server

```bash
npm run dev
```

You should see:
```
▲ Next.js 15.x.x
- Local:        http://localhost:3000
- Ready in X.Xs
```

### Step 2: Open in Browser

1. Open your browser
2. Go to: `http://localhost:3000`
3. You should see the login page!

### Step 3: Sign In as Super Admin

1. Enter your super admin email and password
2. Click **Sign In**
3. You should be redirected to the dashboard
4. Check the sidebar - you should see **"Admin Panel"** option

✅ **Congratulations! Your application is running!**

---

## Testing Guide

### Test 1: Super Admin Access

1. Sign in with your super admin account
2. Click **Admin Panel** in the sidebar
3. You should see:
   - Total Gyms: 0
   - Active Gyms: 0
   - No gym accounts yet
4. ✅ Admin panel is working!

### Test 2: Create a New Gym Account

1. **Sign out** from super admin account
2. Click **"Create Account"**
3. Fill in:
   - Full Name: Test Gym Owner
   - Gym Name: Test Fitness Center
   - Email: testgym@example.com
   - Password: test123456
   - Confirm Password: test123456
4. Click **Create Account**
5. You should be automatically logged in
6. You should see the dashboard with 0 members, 0 payments, etc.
7. ✅ Registration is working!

### Test 3: Account Suspension

1. Sign out from test gym account
2. Sign back in as **super admin**
3. Go to **Admin Panel**
4. You should now see 1 gym (Test Fitness Center)
5. Click **Suspend** button
6. Confirm the action
7. The gym status should change to **SUSPENDED**
8. Sign out from admin account
9. Try to sign in as `testgym@example.com`
10. You should be redirected to a **"Account Suspended"** page
11. ✅ Suspension is working!

### Test 4: Reactivate Account

1. Sign in as super admin
2. Go to Admin Panel
3. Click **Reactivate** on the test gym
4. Sign out
5. Sign in as the test gym user
6. You should now be able to access the dashboard
7. ✅ Reactivation is working!

### Test 5: Multi-Device Access

1. While logged in to a gym account, note some test data (or create a test member)
2. Open the same URL in:
   - Different browser
   - Incognito/Private mode
   - Another device
3. Sign in with the same gym account
4. You should see the same data
5. ✅ Cloud sync is working!

---

## Deployment to Production

### Option 1: Deploy to Vercel (Recommended)

Vercel is the platform made by Next.js creators and offers the best integration.

#### Step 1: Prepare for Deployment

1. Make sure all files are saved
2. Make sure `.env.local` is in your `.gitignore`
3. Commit your code to Git:

```bash
git init
git add .
git commit -m "Initial commit - IronGym SaaS"
```

4. Push to GitHub:
   - Create a new repository on GitHub
   - Follow GitHub's instructions to push your code

#### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign up/Sign in (you can use your GitHub account)
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `gym-saas-web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

#### Step 3: Add Environment Variables

In Vercel project settings, add these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

⚠️ **Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL**

#### Step 4: Deploy

1. Click **Deploy**
2. Wait 2-3 minutes
3. Your app will be live!

#### Step 5: Update Supabase Auth Settings

1. Go to your Supabase dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Add your Vercel URL to:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: Add `https://your-app.vercel.app/**`

### Option 2: Deploy to Other Platforms

The application can also be deployed to:
- **Netlify**: Similar to Vercel
- **AWS Amplify**: Good for AWS infrastructure
- **Railway**: Easy deployment with automatic HTTPS
- **DigitalOcean App Platform**: Simple and affordable
- **Render**: Free tier available

All platforms support Next.js and environment variables.

---

## Troubleshooting

### Issue: "Failed to create account" during sign-up

**Solution**:
1. Check browser console for errors (F12)
2. Verify Supabase credentials in `.env.local`
3. Check if RLS policies are enabled on all tables
4. Verify the database schema was fully applied

### Issue: "Your account has been suspended" but I never suspended it

**Solution**:
1. Go to Supabase → Table Editor → gyms
2. Find your gym record
3. Check the `status` column - it should be `active`
4. If it's not, manually update it:
```sql
UPDATE gyms SET status = 'active' WHERE id = 'your-gym-id';
```

### Issue: Can't see data after changing computers

**Solution**:
1. Make sure you're logged in with the same email
2. Check internet connection
3. Open browser console (F12) and check for errors
4. Verify Supabase project is active (not paused)

### Issue: Members page shows empty but I added members

**Solution**:
1. Check if you're logged in to the correct gym account
2. Verify the `gym_id` column in members table matches your user's gym_id
3. Check RLS policies are properly configured
4. Look for JavaScript errors in browser console

### Issue: "Row Level Security" error when accessing data

**Solution**:
This means RLS policies weren't applied correctly:
1. Go to Supabase SQL Editor
2. Re-run the entire `supabase-schema.sql` file
3. Or specifically run the RLS policy sections
4. Refresh your application

### Issue: Super admin can't access admin panel

**Solution**:
1. Verify your user role in Supabase:
```sql
SELECT role FROM users WHERE email = 'your-admin-email@example.com';
```
2. Should return `super_admin`
3. If not, update it:
```sql
UPDATE users SET role = 'super_admin' WHERE email = 'your-admin-email@example.com';
```

### Issue: Application not starting (npm run dev fails)

**Solution**:
1. Delete `node_modules` folder
2. Delete `package-lock.json`
3. Run `npm install` again
4. Try `npm run dev` again

### Issue: Database changes not reflecting

**Solution**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check if using correct account
4. Check browser console for errors

---

## Production Checklist

Before launching to real users:

- [ ] Change all default passwords
- [ ] Set up custom email templates in Supabase
- [ ] Configure custom SMTP provider
- [ ] Set up proper domain name
- [ ] Enable SSL/HTTPS (automatic on Vercel)
- [ ] Set up backup strategy for Supabase
- [ ] Review and test all RLS policies
- [ ] Test account suspension flow
- [ ] Test sign-up flow thoroughly
- [ ] Set up monitoring/analytics
- [ ] Create admin documentation
- [ ] Train support staff on admin panel
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure rate limiting if needed
- [ ] Review security settings
- [ ] Set up automated backups

---

## Getting Help

If you encounter issues:

1. **Check the browser console** (F12) for JavaScript errors
2. **Check Supabase logs** (Logs & Reports section)
3. **Review this guide** - most issues are covered here
4. **Check the README.md** for additional information
5. **Contact support** at support@irongym.com

---

## Next Steps

Now that your application is set up:

1. ✅ Create your super admin account
2. ✅ Test the registration flow
3. ✅ Test account suspension
4. 📝 Customize the gym name and branding
5. 📝 Add real gym accounts
6. 📝 Start using member management features
7. 📝 Train your team on the platform

**Need member management, payments, and other features?** These are ready to be implemented as the next phase!

---

**Last Updated**: October 2026  
**Version**: 1.0.0  
**Platform**: Next.js 15 + Supabase
