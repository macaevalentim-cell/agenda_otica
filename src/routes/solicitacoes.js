const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const router = express.Router();

// Listar solicitações
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT s.*, u.nome as solicitante_nome
      FROM solicitacoes_consultas s
      JOIN usuarios u ON s.solicitado_por = u.id
    `;
    const params = [];
    if (!isAdmin) {
      query += ' WHERE s.solicitado_por = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY s.criado_em DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows.map(s => ({ ...s, data_consulta: formatDateToYYYYMMDD(s.data_consulta) })));
  } catch (error) {
    console.error('❌ Erro ao listar solicitações:', error);
    res.status(500).json({ error: 'Erro interno ao listar solicitações' });
  }
});

// Contar pendentes
router.get('/pendentes/count', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM solicitacoes_consultas WHERE status = ?', ['pendente']);
    res.json({ total: parseInt(rows[0].total) });
  } catch (error) {
    console.error('❌ Erro ao contar pendentes:', error);
    res.status(500).json({ error: 'Erro interno ao contar pendentes' });
  }
});

// Criar solicitação (vendedor)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
      data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
      data_consulta, horario1, horario2, horario3,
      medico_id, medico_nome, observacoes, numero_pedido
    } = req.body;

    // Validações
    if (!paciente_nome || !paciente_telefone) {
      return res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios.' });
    }
    if (!data_consulta || !horario1 || !medico_id) {
      return res.status(400).json({ error: 'Data, 1º horário e médico são obrigatórios.' });
    }

    // Verifica se o médico atende no dia
    const diaSemana = new Date(data_consulta).getDay();
    const [horariosConfig] = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = ? AND dia_semana = ? AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horariosConfig.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
    }

    // Valida os horários sugeridos
    const horariosSugeridos = [horario1, horario2, horario3].filter(h => h);
    for (const hor of horariosSugeridos) {
      let valido = false;
      for (const config of horariosConfig) {
        if (hor >= config.hora_inicio && hor < config.hora_fim) {
          valido = true;
          break;
        }
      }
      if (!valido) {
        return res.status(400).json({ error: `Horário ${hor} não está dentro do expediente do médico.` });
      }
    }

    // Evita conflitos com solicitações pendentes
    for (const hor of horariosSugeridos) {
      const [conflito] = await pool.query(
        `SELECT id FROM solicitacoes_consultas
         WHERE data_consulta = ? AND medico_id = ? AND status = ?
         AND (horario_sugerido1 = ? OR horario_sugerido2 = ? OR horario_sugerido3 = ?)`,
        [data_consulta, medico_id, 'pendente', hor, hor, hor]
      );
      if (conflito.length > 0) {
        return res.status(400).json({ error: `Horário ${hor} já possui solicitação pendente para este médico.` });
      }
    }

    // Cria paciente se CPF for fornecido
    if (paciente_cpf) {
      const [existente] = await pool.query('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
      if (existente.length === 0) {
        await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf, data_nascimento || null,
           neurodivergente || 0, deficiencia_fisica || 0, encaixe || 1, req.user.id]
        );
      }
    }

    // Insere solicitação
    const [result] = await pool.query(
      `INSERT INTO solicitacoes_consultas
       (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta,
        horario_sugerido1, horario_sugerido2, horario_sugerido3,
        medico_id, medico_nome, observacoes, numero_pedido, solicitado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf || null,
        data_consulta, horario1, horario2 || null, horario3 || null,
        medico_id, medico_nome, observacoes || null, numero_pedido || null,
        req.user.id
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Solicitação enviada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao criar solicitação:', error);
    res.status(500).json({ error: 'Erro interno ao criar solicitação' });
  }
});

// Aprovar/rejeitar solicitação (admin)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status, horario_escolhido } = req.body;
    if (!['aprovado', 'rejeitado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const [solic] = await pool.query('SELECT * FROM solicitacoes_consultas WHERE id = ?', [req.params.id]);
    if (solic.length === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const s = solic[0];

    if (status === 'aprovado') {
      if (!horario_escolhido) {
        return res.status(400).json({ error: 'Selecione um horário para aprovar.' });
      }
      const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
      if (!horarios.includes(horario_escolhido)) {
        return res.status(400).json({ error: 'Horário escolhido não está entre os sugeridos.' });
      }

      // Validar horário
      const diaSemana = new Date(s.data_consulta).getDay();
      const [horariosConfig] = await pool.query(
        'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = ? AND dia_semana = ? AND ativo = true',
        [s.medico_id, diaSemana]
      );
      let valido = false;
      for (const config of horariosConfig) {
        if (horario_escolhido >= config.hora_inicio && horario_escolhido < config.hora_fim) {
          valido = true;
          break;
        }
      }
      if (!valido) {
        return res.status(400).json({ error: 'Horário escolhido não está no expediente do médico.' });
      }

      // Verifica conflito com consultas existentes
      const [conflito] = await pool.query(
        'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND status NOT IN (?, ?)',
        [s.data_consulta, horario_escolhido, s.medico_id, 'cancelada', 'realizada']
      );
      if (conflito.length > 0) {
        return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
      }

      // Cria consulta
      const [result] = await pool.query(
        `INSERT INTO consultas
         (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario,
          medico_id, medico_nome, observacoes, numero_pedido, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.paciente_nome, s.paciente_telefone, s.paciente_email, s.paciente_cpf,
         s.data_consulta, horario_escolhido, s.medico_id, s.medico_nome,
         s.observacoes, s.numero_pedido, s.solicitado_por]
      );
      const consultaId = result.insertId;
      await agendarLembrete(consultaId, s.paciente_nome, s.paciente_telefone, s.data_consulta,
        horario_escolhido, s.medico_nome, s.medico_id, s.solicitado_por, s.numero_pedido);
      await pool.query('UPDATE solicitacoes_consultas SET horario_escolhido = ? WHERE id = ?', [horario_escolhido, req.params.id]);
    }

    await pool.query('UPDATE solicitacoes_consultas SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: `Solicitação ${status} com sucesso` });
  } catch (error) {
    console.error('❌ Erro ao atualizar solicitação:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar solicitação' });
  }
});

module.exports = router;