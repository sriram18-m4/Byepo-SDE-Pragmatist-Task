require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./src/routes/auth.routes');
const superAdminRoutes = require('./src/routes/superAdmin.routes');
const orgAdminRoutes = require('./src/routes/orgAdmin.routes');
const endUserRoutes = require('./src/routes/endUser.routes');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'multi-tenant-feature-flags' });
});

app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/org-admin', orgAdminRoutes);
app.use('/api/end-user', endUserRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Unexpected server error'
  });
});

app.listen(port, () => {
  console.log(`Feature flag server running on http://localhost:${port}`);
});
