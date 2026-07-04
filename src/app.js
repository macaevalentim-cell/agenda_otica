const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Importação de todas as rotas
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const medicosRoutes = require('./routes/medicos');
const clientesRoutes = require('./routes/clientes');
const consultasRoutes = require('./routes/consultas');
const solicitacoesRoutes = require('./routes/solicitacoes');
const usuariosRoutes = require('./routes/usuarios');
const horariosRoutes = require('./routes/horarios');
const lembretesRoutes = require('./routes/lembretes');
const whatsappRoutes = require('./routes/whatsapp');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// ==================== SEGURANÇA (CSP) ====================
// DESABILITAMOS A CSP PARA PERMITIR EVENT HANDLERS INLINE (onclick, onchange, etc.)
// Em produção, você pode reativar com as diretivas corretas se preferir
app.use(helmet({
  contentSecurityPolicy: false,  // Desabilita completamente (resolve o erro)
  // Ou, se quiser manter, use:
  // contentSecurityPolicy: {
  //   directives: {
  //     defaultSrc: ["'self'"],
  //     scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
  //     scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
  //     styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
  //     imgSrc: ["'self'", "data:", "https:"],
  //     connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
  //     fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
  //   }
  // }
}));

// ==================== CORS ====================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  optionsSuccessStatus: 200
}));

// ==================== MIDDLEWARES GERAIS ====================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
});
app.use('/api/', limiter);

// ==================== ROTAS DA API ====================
app.use('/api', authRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/medicos', medicosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/consultas', consultasRoutes);
app.use('/api/solicitacoes', solicitacoesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', horariosRoutes); // as rotas de horários estão com prefixo /api
app.use('/api/lembretes', lembretesRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ==================== PÁGINA INICIAL ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== MIDDLEWARE DE ERRO ====================
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;