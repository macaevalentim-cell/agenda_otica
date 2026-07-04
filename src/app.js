const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const medicosRoutes = require('./routes/medicos');
const clientesRoutes = require('./routes/clientes');
const consultasRoutes = require('./routes/consultas');
const solicitacoesRoutes = require('./routes/solicitacoes');
const usuariosRoutes = require('./routes/usuarios');
const horariosRoutes = require('./routes/horarios');
const lembretesRoutes = require('./routes/lembretes');
const whatsappRoutes = require('./routes/whatsapp');
const dashboardRoutes = require('./routes/dashboard');
const perfilRoutes = require('./routes/perfil');

const app = express();

// CSP desabilitada para permitir inline event handlers
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({ origin: process.env.FRONTEND_URL || '*', optionsSuccessStatus: 200 }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use('/api', authRoutes);
app.use('/api/medicos', medicosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/solicitacoes', solicitacoesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', horariosRoutes);
app.use('/api/lembretes', lembretesRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/perfil', perfilRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;