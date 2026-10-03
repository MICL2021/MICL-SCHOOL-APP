MICL REAL SCHOOL APP
======================
A real full-stack starter app for Modern Institute of Creative Learning.

STACK
- Node.js + Express API
- SQLite database
- bcrypt password hashing
- JWT authentication
- Responsive mobile-first web/PWA-style frontend

DEMO ACCOUNTS
Student: student@micl.edu / Student@123
Admin:   admin@micl.edu / Admin@123

RUN
1. Install Node.js 18+.
2. Open this folder in Terminal.
3. Run: npm install
4. Set a strong JWT secret:
   Linux/macOS: export JWT_SECRET="your-long-secret"
   Windows PowerShell: $env:JWT_SECRET="your-long-secret"
5. Run: npm start
6. Open http://localhost:3000

DATABASE
The SQLite database is created automatically at data/micl.db.

IMPORTANT FOR PUBLIC DEPLOYMENT
- Change the demo passwords.
- Set a strong JWT_SECRET.
- Put the app behind HTTPS.
- Add backups, rate limiting, audit logs and proper admin permissions.
- Replace sample school contact details and add the school's actual data.
- For app-store Android/iOS packaging, this web app can be wrapped as a PWA/Capacitor app after deployment.

ADMIN API FEATURES
- Create students/teachers
- Add notices
- Add homework
- Add events
- Record attendance
- Add results

The supplied UI is functional and connected to the local database; it is not just a visual mockup.
