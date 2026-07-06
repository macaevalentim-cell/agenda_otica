const { pool } = require('../config/database');

async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataConsulta, horario, medicoNome, medicoId, vendedorId, numeroPedido) {
  try {
    // Busca dados da loja via consulta (join com usuarios e lojas)
    const [empresaData] = await pool.query(`
      SELECT l.nome as empresa_nome, l.endereco as empresa_endereco
      FROM consultas c
      JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE c.id = ?
    `, [consultaId]);

    const empresaNome = empresaData[0]?.empresa_nome || 'Ótica Macaé';
    const empresaEndereco = empresaData[0]?.empresa_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';

    // Busca dados do médico
    const [medico] = await pool.query('SELECT whatsapp, mensagem_padrao FROM medicos WHERE id = ?', [medicoId]);
    const medicoWhatsapp = medico[0]?.whatsapp || null;
    const mensagemPadrao = medico[0]?.mensagem_padrao || '';

    // Busca dados do paciente
    const [paciente] = await pool.query(
      'SELECT neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE nome = ? AND telefone = ?',
      [pacienteNome, pacienteTelefone]
    );
    let condicao = 'Encaixe';
    if (paciente.length) {
      const p = paciente[0];
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
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [consultaId, 'paciente', pacienteNome, pacienteTelefone, msgPaciente, 'whatsapp', dataLembrete]
    );

    if (medicoWhatsapp) {
      await pool.query(
        `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [consultaId, 'medico', medicoNome, medicoWhatsapp, msgMedico, 'whatsapp', dataLembrete]
      );
    }
    console.log('✅ Lembrete agendado para:', pacienteNome);
  } catch (error) {
    console.error('Erro ao agendar lembrete:', error);
  }
}

module.exports = { agendarLembrete };