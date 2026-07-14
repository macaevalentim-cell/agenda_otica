const { pool } = require('../config/database');

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataNascimento, dataConsulta, horario, medicoNome, medicoId, vendedorId, numeroPedido) {
  try {
    // Busca dados da loja
    const empresaData = await pool.query(`
      SELECT l.nome as empresa_nome, l.endereco as empresa_endereco
      FROM consultas c
      JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE c.id = $1
    `, [consultaId]);

    const empresaNome = empresaData.rows[0]?.empresa_nome || 'Ótica Macaé';
    const empresaEndereco = empresaData.rows[0]?.empresa_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';

    // Busca dados do médico
    const medico = await pool.query('SELECT whatsapp, mensagem_padrao FROM medicos WHERE id = $1', [medicoId]);
    const medicoWhatsapp = medico.rows[0]?.whatsapp || null;
    const mensagemPadrao = medico.rows[0]?.mensagem_padrao || '';

    // Busca dados do paciente (condição)
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

    // ===== CALCULAR IDADE =====
    const idade = calcularIdade(dataNascimento);
    const idadeStr = idade !== null ? `\nIdade: ${idade} anos` : '';

    const dataLembrete = new Date(dataConsulta);
    dataLembrete.setDate(dataLembrete.getDate() - 1);
    dataLembrete.setHours(8, 0, 0, 0);

    const pedidoStr = numeroPedido ? `\nNº Pedido: ${numeroPedido}` : '';

    // Mensagem para o paciente
    const msgPaciente = `🏥 *${empresaNome} - GUIA DE CONSULTA*\n\n` +
      `Paciente: ${pacienteNome}\n` +
      `Data: ${dataConsulta}\n` +
      `Horário: ${horario}\n` +
      `Médico: Dr. ${medicoNome}\n` +
      `Local: ${empresaEndereco}\n` +
      `Condição: ${condicao}${idadeStr}${pedidoStr}\n\n` +
      `${mensagemPadrao ? '*Mensagem do médico:*\n' + mensagemPadrao : ''}`;

    // ===== MENSAGEM PARA O MÉDICO (COM IDADE) =====
    const msgMedico = `📋 *Nova consulta agendada*\n\n` +
      `Empresa: ${empresaNome}\n` +
      `Paciente: ${pacienteNome}\n` +
      `Idade: ${idade !== null ? idade + ' anos' : 'Não informada'}\n` +
      `Data: ${dataConsulta}\n` +
      `Horário: ${horario}\n` +
      `Telefone: ${pacienteTelefone}\n` +
      `Local: ${empresaEndereco}\n` +
      `Condição: ${condicao}${pedidoStr}`;

    // Salvar lembrete para paciente
    await pool.query(
      `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [consultaId, 'paciente', pacienteNome, pacienteTelefone, msgPaciente, 'whatsapp', dataLembrete]
    );

    // Salvar lembrete para médico (se tiver WhatsApp)
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

module.exports = { agendarLembrete, calcularIdade };