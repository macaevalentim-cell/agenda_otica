const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const router = express.Router();

// Listar consultas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT c.*, u.nome as vendedor_nome, l.nome as loja_nome, l.endereco as loja_endereco,
             CASE WHEN c.criado_por = ? THEN 1 ELSE 0 END as is_own
      FROM consultas c
      LEFT JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN lojas l ON u.loja_id = l.id
    `;
    const params = [req.user.id];
    if (!isAdmin) {
      query += ' WHERE c.criado_por = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY c.data_consulta ASC, c.horario ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    console.error('❌ Erro ao listar consultas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Filtrar consultas
router.get('/filtrar', authenticateToken, async (req, res) => {
  try {
    const { data_inicio, data_fim, medico_id, status, paciente, vendedor_id } = req.query;
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT c.*, u.nome as vendedor_nome, l.nome as loja_nome, l.endereco as loja_endereco,
             CASE WHEN c.criado_por = ? THEN 1 ELSE 0 END as is_own
      FROM consultas c
      LEFT JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE 1=1
    `;
    const params = [req.user.id];
    if (!isAdmin) {
      query += ' AND c.criado_por = ?';
      params.push(req.user.id);
    }

    if (data_inicio) { query += ' AND c.data_consulta >= ?'; params.push(data_inicio); }
    if (data_fim) { query += ' AND c.data_consulta <= ?'; params.push(data_fim); }
    if (medico_id) { query += ' AND c.medico_id = ?'; params.push(parseInt(medico_id)); }
    if (status) { query += ' AND c.status = ?'; params.push(status); }
    if (paciente) { query += ' AND c.paciente_nome LIKE ?'; params.push(`%${paciente}%`); }
    if (isAdmin && vendedor_id) { query += ' AND c.criado_por = ?'; params.push(parseInt(vendedor_id)); }

    query += ' ORDER BY c.data_consulta DESC, c.horario DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    console.error('❌ Erro ao filtrar consultas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Criar consulta (apenas admin)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
      data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
      data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido
    } = req.body;

    // Valida horário
    const diaSemana = new Date(data_consulta).getDay();
    const [horariosConfig] = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = ? AND dia_semana = ? AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horariosConfig.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia.' });
    }
    let valido = false;
    for (const config of horariosConfig) {
      if (horario >= config.hora_inicio && horario < config.hora_fim) { valido = true; break; }
    }
    if (!valido) return res.status(400).json({ error: 'Horário fora do expediente.' });

    // Conflito
    const [conflito] = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND status NOT IN (?, ?)',
      [data_consulta, horario, medico_id, 'cancelada', 'realizada']
    );
    if (conflito.length > 0) return res.status(400).json({ error: 'Horário já ocupado.' });

    // Gerencia paciente
    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const [existente] = await pool.query('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
      if (existente.length > 0) {
        pacienteId = existente[0].id;
      } else {
        const [result] = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf, data_nascimento || null,
           neurodivergente || 0, deficiencia_fisica || 0, encaixe || 1, req.user.id]
        );
        pacienteId = result.insertId;
      }
    }

    // Busca dados do paciente
    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const [cliente] = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = ?',
        [pacienteId]
      );
      if (cliente.length > 0) {
        nome = cliente[0].nome;
        telefone = cliente[0].telefone;
        email = cliente[0].email;
        cpf = cliente[0].cpf;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO consultas (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, telefone, email || null, cpf || null, data_consulta, horario, medico_id, medico_nome,
       observacoes || null, numero_pedido || null, req.user.id]
    );
    const consultaId = result.insertId;
    await agendarLembrete(consultaId, nome, telefone, data_consulta, horario, medico_nome, medico_id, req.user.id, numero_pedido);
    res.status(201).json({ id: consultaId });
  } catch (error) {
    console.error('❌ Erro ao criar consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar consulta (apenas admin)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const {
      paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
      data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
      data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido, status
    } = req.body;

    const [consultaAtual] = await pool.query('SELECT status FROM consultas WHERE id = ?', [req.params.id]);
    if (consultaAtual.length === 0) return res.status(404).json({ error: 'Consulta não encontrada' });
    if (consultaAtual[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada, não pode editar.' });
    if (consultaAtual[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada, não pode editar.' });

    // Validações de horário (semelhantes ao POST)
    const diaSemana = new Date(data_consulta).getDay();
    const [horariosConfig] = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = ? AND dia_semana = ? AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horariosConfig.length === 0) return res.status(400).json({ error: 'Médico não atende neste dia.' });
    let valido = false;
    for (const config of horariosConfig) {
      if (horario >= config.hora_inicio && horario < config.hora_fim) { valido = true; break; }
    }
    if (!valido) return res.status(400).json({ error: 'Horário fora do expediente.' });

    const [conflito] = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND id != ? AND status NOT IN (?, ?)',
      [data_consulta, horario, medico_id, req.params.id, 'cancelada', 'realizada']
    );
    if (conflito.length > 0) return res.status(400).json({ error: 'Horário já ocupado.' });

    // Gerencia paciente (similar ao POST)
    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const [existente] = await pool.query('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
      if (existente.length > 0) {
        pacienteId = existente[0].id;
      } else {
        const [result] = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf, data_nascimento || null,
           neurodivergente || 0, deficiencia_fisica || 0, encaixe || 1, req.user.id]
        );
        pacienteId = result.insertId;
      }
    }

    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const [cliente] = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = ?',
        [pacienteId]
      );
      if (cliente.length > 0) {
        nome = cliente[0].nome;
        telefone = cliente[0].telefone;
        email = cliente[0].email;
        cpf = cliente[0].cpf;
      }
    }

    await pool.query(
      `UPDATE consultas SET paciente_nome=?, paciente_telefone=?, paciente_email=?, paciente_cpf=?,
       data_consulta=?, horario=?, medico_id=?, medico_nome=?, observacoes=?, numero_pedido=?, status=?
       WHERE id=?`,
      [nome, telefone, email || null, cpf || null, data_consulta, horario, medico_id, medico_nome,
       observacoes || null, numero_pedido || null, status || 'agendada', req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    console.error('❌ Erro ao atualizar consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Excluir consulta
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [consulta] = await pool.query('SELECT status FROM consultas WHERE id = ?', [req.params.id]);
    if (consulta.length === 0) return res.status(404).json({ error: 'Consulta não encontrada' });
    if (consulta[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada, não pode excluir.' });
    await pool.query('DELETE FROM consultas WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Confirmar consulta
router.put('/:id/confirmar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [consulta] = await pool.query('SELECT status FROM consultas WHERE id = ?', [req.params.id]);
    if (consulta.length === 0) return res.status(404).json({ error: 'Não encontrada' });
    if (consulta[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada' });
    if (consulta[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada' });
    if (consulta[0].status === 'confirmada') return res.status(400).json({ error: 'Já confirmada' });
    await pool.query('UPDATE consultas SET status = ? WHERE id = ?', ['confirmada', req.params.id]);
    res.json({ message: 'Confirmada' });
  } catch (error) {
    console.error('❌ Erro ao confirmar consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Processar consulta
router.put('/:id/processar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [consulta] = await pool.query('SELECT status FROM consultas WHERE id = ?', [req.params.id]);
    if (consulta.length === 0) return res.status(404).json({ error: 'Não encontrada' });
    if (consulta[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada' });
    if (consulta[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada' });
    await pool.query('UPDATE consultas SET status = ? WHERE id = ?', ['realizada', req.params.id]);
    res.json({ message: 'Realizada' });
  } catch (error) {
    console.error('❌ Erro ao processar consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;