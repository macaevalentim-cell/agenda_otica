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

// ===== TRUST PROXY (para Render) =====
app.set('trust proxy', 1);

// ===== SEGURANÇA =====
app.use(helmet({
  contentSecurityPolicy: false, // Desativa CSP para permitir FontAwesome e outros
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
// Serve arquivos da pasta public (CSS, JS, imagens)
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
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // limite de 200 requisições por IP
  message: 'Muitas requisições, tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ===== ROTAS DA API =====
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
app.use('/api/lojas', lojasRoutes);

// ===== ROTA PRINCIPAL =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ===== ROTA DE FALLBACK (SPA) =====
app.get('*', (req, res) => {
  // Se a requisição for para um arquivo estático que não existe, retorna 404
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  // Para outras rotas, redireciona para o index.html (SPA)
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ===== MIDDLEWARE DE ERRO =====
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  
  // Se for um erro de validação do express-validator
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({ 
      error: 'Dados inválidos', 
      details: err.array() 
    });
  }

  // Erro de banco de dados ou outros
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';
  
  res.status(status).json({ 
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ===== LOG DE REQUISIÇÕES (apenas em desenvolvimento) =====
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
  });
}

module.exports = app;