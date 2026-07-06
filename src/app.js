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

// ==================== TRUST PROXY (NECESSÁRIO PARA RENDER) ====================
// Render utiliza um proxy reverso/load balancer. Esta configuração permite que o Express
// confie no cabeçalho X-Forwarded-For para identificar o IP real do cliente.
// Isso é essencial para o rate limiting funcionar corretamente.
app.set('trust proxy', 1);

// ==================== SEGURANÇA (CSP) ====================
// Desabilitamos a CSP para permitir event handlers inline no frontend
app.use(helmet({
  contentSecurityPolicy: false
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
// Aumentamos o limite para 200 requisições por 15 minutos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // limite de 200 requisições por IP
  message: 'Muitas requisições, tente novamente mais tarde.'
});
app.use('/api/', limiter);

// ==================== ROTAS DA API ====================
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