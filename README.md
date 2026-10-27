# IronGym SaaS - Multi-Gym Management Platform

A professional, cloud-based gym management SaaS platform built with Next.js, TypeScript, Supabase, and Tailwind CSS. Manage multiple gym locations with secure tenant isolation, beautiful UI, and comprehensive features.

## 🚀 Features

### Multi-Tenant Architecture
- **Complete Tenant Isolation**: Each gym has its own secure workspace
- **Cloud Data Storage**: All data stored securely in Supabase
- **Multi-Device Access**: Access your gym from any device, anywhere
- **Automatic Synchronization**: Real-time data sync across all devices

### Super Admin Dashboard
- Manage all gym accounts from one central location
- Suspend/reactivate gym accounts instantly
- Monitor platform-wide statistics
- Search, filter, and view detailed gym information
- Audit logs for all administrative actions

### Gym Owner Features
- **Dashboard**: Real-time statistics and insights
- **Member Management**: Add, edit, track members with membership expiry
- **Payment Tracking**: Record payments with automatic receipt generation
- **Attendance System**: Check-in/check-out tracking
- **Membership Plans**: Create and manage custom plans
- **Expense Tracking**: Monitor gym expenses (Manager/Owner only)
- **Reports**: Comprehensive business reports (Manager/Owner only)
- **Settings**: Customize gym profile and preferences

### Security & Access Control
- **Role-Based Permissions**: Super Admin, Gym Owner, Manager, Receptionist
- **Row Level Security (RLS)**: Database-level access control
- **Secure Authentication**: Powered by Supabase Auth
- **Account Status Enforcement**: Suspended accounts cannot access protected features
- **Session Management**: Secure session handling

### Beautiful Figma-Style UI
- Modern, clean, professional design
- Consistent design system
- Responsive across desktop, tablet, and mobile
- Smooth animations and transitions
- Accessible and user-friendly
- Dark/light theme support (coming soon)

## 📋 Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Supabase account (free tier works)

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
cd gym-saas-web
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy your project URL and anon key

### 3. Configure Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

⚠️ **Important**: Never commit the service role key to version control!

### 4. Set Up Database Schema

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy the entire contents of `supabase-schema.sql`
4. Paste and run it in the SQL Editor
5. Wait for the schema to be created (tables, RLS policies, functions, etc.)

### 5. Create Super Admin Account

1. Go to Supabase Authentication > Users
2. Click "Add user" > "Create new user"
3. Enter your email and password
4. Copy the user UUID
5. Go to SQL Editor and run:

```sql
-- Replace 'your-user-uuid' with the actual UUID from step 4
INSERT INTO users (id, email, full_name, role, is_active)
VALUES ('your-user-uuid', 'admin@yourdomain.com', 'Super Admin', 'super_admin', true);
```

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎯 Usage

### For Super Admin

1. Sign in with your super admin account
2. Access the Admin Panel from the sidebar
3. View all registered gyms
4. Suspend or reactivate gym accounts as needed
5. Monitor platform statistics

### For Gym Owners

1. Click "Create Account" on the login page
2. Fill in your gym details
3. You'll be automatically logged in after successful registration
4. Start adding members, plans, and recording payments
5. Your data is automatically saved to the cloud

### Default Account Behavior

- **All gym accounts are ACTIVE by default** after registration
- Only the Super Admin can manually suspend accounts
- No automatic suspensions based on:
  - Device changes
  - Browser changes
  - IP address changes
  - Subscription status (unless you implement billing)

## 🔐 Security Features

### Database-Level Security
- Row Level Security (RLS) enforced on all tables
- Gym data isolation at the database level
- Secure server-side authorization

### Account Suspension
- Only Super Admin can suspend accounts
- Suspended users cannot access protected features
- Database policies enforce suspension status
- Clear messaging for suspended users

### Authentication
- Secure password hashing
- Email verification (configurable)
- Password reset functionality
- Session management

## 📱 Multi-Device Support

Your gym data is stored in the cloud and accessible from:
- Any computer or laptop
- Any web browser
- Multiple devices simultaneously
- After reinstalling the browser
- After logging out and back in

**Your data belongs to your gym account, not to a specific device.**

## 🏗️ Project Structure

```
gym-saas-web/
├── app/
│   ├── admin/              # Super admin dashboard
│   ├── auth/               # Authentication pages
│   ├── dashboard/          # Gym owner dashboard
│   ├── suspended/          # Suspended account page
│   └── layout.tsx          # Root layout
├── components/
│   ├── ui/                 # Reusable UI components
│   ├── dashboard/          # Dashboard-specific components
│   └── admin/              # Admin-specific components
├── lib/
│   ├── supabase/           # Supabase client configuration
│   ├── auth.ts             # Authentication functions
│   └── utils.ts            # Utility functions
├── types/
│   └── database.ts         # TypeScript type definitions
├── supabase-schema.sql     # Complete database schema
└── middleware.ts           # Route protection & auth middleware
```

## 🚀 Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables from `.env.local`
5. Deploy!

### Environment Variables for Production

Make sure to add all environment variables in your deployment platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (your production URL)

## 📊 Database Schema

The database includes:
- **gyms**: Multi-tenant core table
- **users**: Extended user profiles with roles
- **members**: Gym members with membership tracking
- **plans**: Customizable membership plans
- **payments**: Payment records with receipts
- **attendance**: Check-in/check-out tracking
- **expenses**: Expense tracking
- **audit_log**: Action audit trail
- **settings**: Gym-specific settings

All tables have proper indexes, foreign keys, and RLS policies.

## 🐛 Troubleshooting

### Cannot Sign Up / Create Account

- Check browser console for errors
- Verify Supabase credentials are correct
- Ensure database schema is fully applied
- Check Supabase Auth settings (email confirmation, etc.)

### Cannot Access Data After Changing Devices

- Verify you're logged in with the correct email
- Check internet connection
- Ensure Supabase project is active
- Check browser console for errors

### Suspended Account Issues

- Only Super Admin can suspend/reactivate accounts
- Check the gyms table status column
- Verify RLS policies are properly applied
- Check middleware.ts is working correctly

## 📝 License

This project is proprietary software. All rights reserved.

## 🤝 Support

For support, email support@irongym.com or create an issue in the repository.

## ✅ Feature Checklist

- [x] Multi-tenant architecture with complete data isolation
- [x] Super Admin Dashboard
- [x] Gym account suspend/reactivate functionality
- [x] User registration with gym creation
- [x] Secure authentication (login, logout, password reset)
- [x] Cloud data storage with Supabase
- [x] Multi-device access support
- [x] Dashboard with real-time statistics
- [x] Role-based access control (Super Admin, Gym Owner, Manager, Receptionist)
- [x] Beautiful, modern, Figma-style UI
- [x] Responsive design (desktop, tablet, mobile)
- [x] Row Level Security (RLS) policies
- [x] Account status enforcement (suspended users blocked)
- [x] Professional error handling and user feedback
- [ ] Member management (CRUD operations)
- [ ] Payment tracking and receipt generation
- [ ] Attendance check-in/check-out
- [ ] Membership plans management
- [ ] Expense tracking
- [ ] Reports and analytics
- [ ] Settings and customization
- [ ] Bulk import/export
- [ ] Email notifications
- [ ] SMS integration
- [ ] Barcode/RFID support

## 🎨 UI/UX Highlights

- Clean, spacious layouts
- Professional color palette
- Consistent iconography (Lucide React)
- Smooth transitions and animations
- Clear typography hierarchy
- Intuitive navigation
- Loading states and skeletons
- Empty states with helpful messages
- Error states with recovery actions
- Success confirmations
- Accessible components

---

Built with ❤️ for gym owners worldwide
