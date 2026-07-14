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

// ===== VERIFICAR SE TODAS AS ROTAS SÃO FUNÇÕES =====
console.log('🔍 Verificando rotas:');
console.log('authRoutes:', typeof authRoutes);
console.log('medicosRoutes:', typeof medicosRoutes);
console.log('clientesRoutes:', typeof clientesRoutes);
console.log('consultasRoutes:', typeof consultasRoutes);
console.log('solicitacoesRoutes:', typeof solicitacoesRoutes);
console.log('usuariosRoutes:', typeof usuariosRoutes);
console.log('horariosRoutes:', typeof horariosRoutes);
console.log('lembretesRoutes:', typeof lembretesRoutes);
console.log('whatsappRoutes:', typeof whatsappRoutes);
console.log('dashboardRoutes:', typeof dashboardRoutes);
console.log('perfilRoutes:', typeof perfilRoutes);
console.log('lojasRoutes:', typeof lojasRoutes);

const app = express();

// ===== TRUST PROXY (para Render) =====
app.set('trust proxy', 1);

// ===== SEGURANÇA =====
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// ===== CORS =====
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001']
  : ['*'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));

// ===== MIDDLEWARES =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== ARQUIVOS ESTÁTICOS =====
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Muitas requisições, tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ===== ROTAS DA API =====
// Verifica se cada rota é uma função antes de usar
const rotas = [
  { path: '/api', router: authRoutes },
  { path: '/api/medicos', router: medicosRoutes },
  { path: '/api/clientes', router: clientesRoutes },
  { path: '/api/consultas', router: consultasRoutes },
  { path: '/api/solicitacoes', router: solicitacoesRoutes },
  { path: '/api/usuarios', router: usuariosRoutes },
  { path: '/api', router: horariosRoutes },
  { path: '/api/lembretes', router: lembretesRoutes },
  { path: '/api/whatsapp', router: whatsappRoutes },
  { path: '/api/dashboard', router: dashboardRoutes },
  { path: '/api/perfil', router: perfilRoutes },
  { path: '/api/lojas', router: lojasRoutes },
];

rotas.forEach(({ path, router }) => {
  if (typeof router === 'function') {
    app.use(path, router);
  } else {
    console.error(`❌ A rota em "${path}" não é uma função! Tipo: ${typeof router}`);
    console.error('Conteúdo:', router);
  }
});

// ===== ROTA PRINCIPAL =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ===== ROTA DE FALLBACK (SPA) =====
app.get('*', (req, res) => {
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ===== MIDDLEWARE DE ERRO =====
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({ error: 'Dados inválidos', details: err.array() });
  }
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';
  res.status(status).json({ 
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ===== LOG DE REQUISIÇÕES =====
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
  });
}

module.exports = app;