const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Importação das rotas
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
const lojasRoutes = require('./routes/lojas');

const app = express();

// ==================== TRUST PROXY (Render) ====================
app.set('trust proxy', 1);

// ==================== SEGURANÇA ====================
app.use(helmet({ contentSecurityPolicy: false }));

// ==================== CORS ====================
app.use(cors({ origin: process.env.FRONTEND_URL || '*', optionsSuccessStatus: 200 }));

// ==================== MIDDLEWARES ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ARQUIVOS ESTÁTICOS ====================
app.use(express.static(path.join(__dirname, '../public')));

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Muitas requisições, tente novamente mais tarde.'
});
app.use('/api/', limiter);

// ==================== ROTAS ====================
app.use('/api', authRoutes);
app.use('/api/medicos', medicosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/solicitacoes', solicitacoesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', horariosRoutes);               // <-- ROTAS DE HORÁRIOS
app.use('/api/lembretes', lembretesRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/lojas', lojasRoutes);

// ==================== PÁGINA INICIAL ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== ROTA DE FALLBACK (para SPA) ====================
app.get('*', (req, res) => {
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== MIDDLEWARE DE ERRO ====================
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;