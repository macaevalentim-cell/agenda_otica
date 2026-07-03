const { pool } = require('../config/database');

async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataConsulta, horario, medicoNome, medicoId, vendedorId, numeroPedido) {
  try {
    const empresaData = await pool.query(`
      SELECT e.nome as empresa_nome, e.endereco as empresa_endereco, e.telefone as empresa_telefone
      FROM consultas c
      LEFT JOIN empresas e ON c.empresa_id = e.id
      WHERE c.id = $1
    `, [consultaId]);

    const empresaNome = empresaData.rows[0]?.empresa_nome || 'Ótica Macaé';
    const empresaEndereco = empresaData.rows[0]?.empresa_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';
    const empresaTelefone = empresaData.rows[0]?.empresa_telefone || '(22) 99764-0112';

    const medico = await pool.query('SELECT whatsapp, mensagem_padrao FROM medicos WHERE id = $1', [medicoId]);
    const medicoWhatsapp = medico.rows[0]?.whatsapp || null;
    const mensagemPadrao = medico.rows[0]?.mensagem_padrao || '';

    const paciente = await pool.query(
      'SELECT neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE nome = $1 AND telefone = $2',
      [pacienteNome, pacienteTelefone]
    );
    let condicao = 'Encaixe';
    if (paciente.rows.length) {
      const p = paciente.rows[0];
      if (p.neurodivergente && p.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
      else if (p.neurodivergente) condicao = 'Neurodivergente';
      else if (p.deficiencia_fisica) condicao = 'Deficiência Física';
      else if (p.encaixe) condicao = 'Encaixe';
    }

    const dataLembrete = new Date(dataConsulta);
    dataLembrete.setDate(dataLembrete.getDate() - 1);
    dataLembrete.setHours(8, 0, 0, 0);

    const pedidoStr = numeroPedido ? `\nNº Pedido: ${numeroPedido}` : '';
    const msgPaciente = `🏥 *${empresaNome} - GUIA DE CONSULTA*\n\nPaciente: ${pacienteNome}\nData: ${dataConsulta}\nHorário: ${horario}\nMédico: Dr. ${medicoNome}\nLocal: ${empresaEndereco}\nCondição: ${condicao}${pedidoStr}\n\n${mensagemPadrao ? '*Mensagem do médico:*\n' + mensagemPadrao : ''}`;
    const msgMedico = `📋 *Nova consulta agendada*\n\nEmpresa: ${empresaNome}\nPaciente: ${pacienteNome}\nData: ${dataConsulta}\nHorário: ${horario}\nTelefone: ${pacienteTelefone}\nLocal: ${empresaEndereco}\nCondição: ${condicao}${pedidoStr}`;

    await pool.query(
      `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [consultaId, 'paciente', pacienteNome, pacienteTelefone, msgPaciente, 'whatsapp', dataLembrete]
    );

    if (medicoWhatsapp) {
      await pool.query(
        `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [consultaId, 'medico', medicoNome, medicoWhatsapp, msgMedico, 'whatsapp', dataLembrete]
      );
    }
    console.log('✅ Lembrete agendado para:', pacienteNome);
  } catch (error) {
    console.error('Erro ao agendar lembrete:', error);
  }
}

module.exports = { agendarLembrete };