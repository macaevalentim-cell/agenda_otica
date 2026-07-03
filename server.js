const app = require('./src/app');
const { initDatabase } = require('./src/config/database');
const { pool } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👑 Admin: admin / admin123`);
    console.log(`📋 Vendedor: vendedor / vender123`);
  });
}).catch(err => {
  console.error('Falha ao inicializar banco:', err);
  process.exit(1);
});

// Job de lembretes (a cada hora)
setInterval(async () => {
  try {
    const agora = new Date();
    const result = await pool.query(
      'SELECT * FROM lembretes WHERE status = $1 AND data_envio_programada <= $2',
      ['pendente', agora]
    );
    for (const lembrete of result.rows) {
      console.log(`📨 Enviando lembrete para ${lembrete.destinatario_nome} (${lembrete.destinatario_contato})`);
      await pool.query('UPDATE lembretes SET status = $1, enviado_em = NOW() WHERE id = $2', ['enviado', lembrete.id]);
    }
  } catch (error) {
    console.error('Erro no job de lembretes:', error);
  }
}, 3600000);