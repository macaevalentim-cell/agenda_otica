const app = require('./src/app');
const { initDatabase, pool } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

// ===== INICIALIZAÇÃO ROBUSTA =====
async function startServer() {
  try {
    console.log('🚀 Iniciando servidor...');
    
    // Inicializa o banco de dados
    await initDatabase();
    console.log('✅ Banco de dados inicializado com sucesso');

    // Inicia o servidor HTTP
    const server = app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`👑 Admin: admin / admin123`);
      console.log(`📋 Vendedor: vendedor / vender123`);
      console.log(`🏥 Consultório: consultorio / consultorio123`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
    });

    // ===== JOB DE LEMBRETES =====
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
        console.error('❌ Erro no job de lembretes:', error);
      }
    }, 3600000);

    // ===== TRATAMENTO DE ERROS GLOBAIS =====
    process.on('uncaughtException', (err) => {
      console.error('❌ Exceção não capturada:', err);
      // Não derruba o servidor intencionalmente
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promessa rejeitada não tratada:', reason);
    });

    // ===== SHUTDOWN GRACEFUL =====
    process.on('SIGTERM', () => {
      console.log('🛑 Recebido SIGTERM, encerrando servidor...');
      server.close(() => {
        console.log('✅ Servidor encerrado');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

// ===== INICIAR =====
startServer();