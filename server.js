
const express       = require('express');
const path          = require('path');
const dotenv        = require('dotenv');
const cors          = require('cors');
const rateLimit     = require('express-rate-limit');
const session       = require('express-session');
const MySQLStore    = require('express-mysql-session')(session);
const { body }      = require('express-validator');
const exphbs        = require('express-handlebars');

// Φόρτωση .env
dotenv.config({ path: './.env' });

const app = express();

// Κοινό MySQL pool (χρησιμοποιείται από controllers/routers)
const db = require('./db');

/* =========================================================
   Core middleware
   ========================================================= */
// CORS — επιτρέπει cookies (credentials) προς το backend
app.use(cors({
  origin: ['http://localhost:3000', 'http://your-frontend-domain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =========================================================
   Sessions (MySQL-backed)
   ========================================================= */
const sessionStore = new MySQLStore(
  {
    clearExpired: true,                 // καθάρισμα ληγμένων
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 60 * 60 * 1000          // 1h lifetime
  },
  db // shared pool
);

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: false,     // true μόνο πίσω από HTTPS/Proxy
    httpOnly: true,
    maxAge: 3600000    // 1h
  }
}));

// Διαθέσιμος ο χρήστης στα templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Logout (καθαρισμός session + cookie)
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid', { path: '/' });
    res.redirect('/login');
  });
});

/* =========================================================
   Static files
   ========================================================= */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================================================
   Views / Handlebars
   ========================================================= */
app.set('views', path.join(__dirname, 'views'));
app.engine('hbs', exphbs.engine({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views')
}));
app.set('view engine', 'hbs');

/* =========================================================
   Security / throttling
   ========================================================= */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15'
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later.' }
});

/* =========================================================
   Pages (SSR views)
   ========================================================= */
app.use('/', require('./routes/pages'));

/* =========================================================
   Auth (login API)
   ========================================================= */
const authController = require('./controllers/authController');
app.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

/* =========================================================
   API Routers
   ========================================================= */
app.use('/api',               require('./routes/topics'));       // θέματα
app.use('/api',               require('./routes/assignments'));  // αναθέσεις
app.use('/api',               require('./routes/invitations'));  // προσκλήσεις
app.use('/api',               require('./routes/statistics'));   // στατιστικά
app.use('/api',               require('./routes/submissions'));  // υποβολές
app.use('/api/secretariat',   require('./routes/secreteriat'));  // γραμματεία
app.use('/api/students',      require('./routes/students'));     // φοιτητές

// Δημόσιο praktiko 
const studentsController = require('./controllers/studentsController');
app.get('/praktiko/:assignmentId', studentsController.viewPraktiko);

/* =========================================================
   Start server
   ========================================================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
