const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const { validate, consultaValidation } = require('../middleware/validation');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT c.*, u.nome as vendedor_nome, e.nome as empresa_nome, e.endereco as empresa_endereco,
             CASE WHEN c.criado_por = $1 THEN 1 ELSE 0 END as is_own
      FROM consultas c 
      LEFT JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN empresas e ON c.empresa_id = e.id
      ORDER BY c.data_consulta ASC, c.horario ASC
    `;
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/filtrar', authenticateToken, async (req, res) => {
  try {
    const { data_inicio, data_fim, medico_id, status, paciente, vendedor_id } = req.query;
    let query = `
      SELECT c.*, u.nome as vendedor_nome, e.nome as empresa_nome, e.endereco as empresa_endereco,
             CASE WHEN c.criado_por = $1 THEN 1 ELSE 0 END as is_own
      FROM consultas c 
      LEFT JOIN usuarios u ON c.criado_por = u.id
      LEFT JOIN empresas e ON c.empresa_id = e.id
      WHERE 1=1
    `;
    const params = [req.user.id];
    let pc = 2;
    if (data_inicio) { query += ` AND c.data_consulta >= $${pc++}`; params.push(data_inicio); }
    if (data_fim) { query += ` AND c.data_consulta <= $${pc++}`; params.push(data_fim); }
    if (medico_id) { query += ` AND c.medico_id = $${pc++}`; params.push(parseInt(medico_id)); }
    if (status) { query += ` AND c.status = $${pc++}`; params.push(status); }
    if (paciente) { query += ` AND c.paciente_nome ILIKE $${pc++}`; params.push(`%${paciente}%`); }
    if (vendedor_id) { query += ` AND c.criado_por = $${pc++}`; params.push(parseInt(vendedor_id)); }
    query += ' ORDER BY c.data_consulta DESC, c.horario DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, isAdmin, validate(consultaValidation), async (req, res) => {
  try {
    const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido } = req.body;

    // Validar horário
    const diaSemana = new Date(data_consulta).getDay();
    const horariosConfig = await pool.query(
      `SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
      [medico_id, diaSemana]
    );
    if (horariosConfig.rows.length === 0) return res.status(400).json({ error: 'Médico não atende neste dia.' });
    let valido = false;
    for (const config of horariosConfig.rows) {
      if (horario >= config.hora_inicio && horario < config.hora_fim) { valido = true; break; }
    }
    if (!valido) return res.status(400).json({ error: 'Horário fora do expediente.' });

    // Conflito
    const conflito = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND status NOT IN ($4, $5)',
      [data_consulta, horario, medico_id, 'cancelada', 'realizada']
    );
    if (conflito.rows.length > 0) return res.status(400).json({ error: 'Horário já ocupado.' });

    // Gerenciar paciente
    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) pacienteId = existente.rows[0].id;
      else {
        const result = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neurodivergente?1:0, deficiencia_fisica?1:0, encaixe?1:0, req.user.id]
        );
        pacienteId = result.rows[0].id;
      }
    }

    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const cliente = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = $1',
        [pacienteId]
      );
      if (cliente.rows.length > 0) {
        nome = cliente.rows[0].nome;
        telefone = cliente.rows[0].telefone;
        email = cliente.rows[0].email;
        cpf = cliente.rows[0].cpf;
      }
    }

    const empresaId = req.user.empresa_id;
    const result = await pool.query(
      `INSERT INTO consultas (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido, criado_por, empresa_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [nome, telefone, toNull(email), toNull(cpf), data_consulta, horario, medico_id, medico_nome, toNull(observacoes), toNull(numero_pedido), req.user.id, empresaId]
    );
    const consultaId = result.rows[0].id;
    await agendarLembrete(consultaId, nome, telefone, data_consulta, horario, medico_nome, medico_id, req.user.id, numero_pedido);
    res.status(201).json({ id: consultaId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, isAdmin, validate(consultaValidation), async (req, res) => {
  try {
    const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido, status } = req.body;

    const consultaAtual = await pool.query('SELECT status FROM consultas WHERE id = $1', [req.params.id]);
    if (consultaAtual.rows.length === 0) return res.status(404).json({ error: 'Consulta não encontrada' });
    if (consultaAtual.rows[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada, não pode editar.' });
    if (consultaAtual.rows[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada, não pode editar.' });

    // Validações de horário e conflito (similares ao POST)
    const diaSemana = new Date(data_consulta).getDay();
    const horariosConfig = await pool.query(
      `SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
      [medico_id, diaSemana]
    );
    if (horariosConfig.rows.length === 0) return res.status(400).json({ error: 'Médico não atende neste dia.' });
    let valido = false;
    for (const config of horariosConfig.rows) {
      if (horario >= config.hora_inicio && horario < config.hora_fim) { valido = true; break; }
    }
    if (!valido) return res.status(400).json({ error: 'Horário fora do expediente.' });

    const conflito = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND id != $4 AND status NOT IN ($5, $6)',
      [data_consulta, horario, medico_id, req.params.id, 'cancelada', 'realizada']
    );
    if (conflito.rows.length > 0) return res.status(400).json({ error: 'Horário já ocupado.' });

    // Gerenciar paciente (similar ao POST)
    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) pacienteId = existente.rows[0].id;
      else {
        const result = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neurodivergente?1:0, deficiencia_fisica?1:0, encaixe?1:0, req.user.id]
        );
        pacienteId = result.rows[0].id;
      }
    }

    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const cliente = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = $1',
        [pacienteId]
      );
      if (cliente.rows.length > 0) {
        nome = cliente.rows[0].nome;
        telefone = cliente.rows[0].telefone;
        email = cliente.rows[0].email;
        cpf = cliente.rows[0].cpf;
      }
    }

    await pool.query(
      `UPDATE consultas SET paciente_nome=$1, paciente_telefone=$2, paciente_email=$3, paciente_cpf=$4, data_consulta=$5, horario=$6, medico_id=$7, medico_nome=$8, observacoes=$9, numero_pedido=$10, status=$11 WHERE id=$12`,
      [nome, telefone, toNull(email), toNull(cpf), data_consulta, horario, medico_id, medico_nome, toNull(observacoes), toNull(numero_pedido), status || 'agendada', req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const consultaAtual = await pool.query('SELECT status FROM consultas WHERE id = $1', [req.params.id]);
    if (consultaAtual.rows.length === 0) return res.status(404).json({ error: 'Consulta não encontrada' });
    if (consultaAtual.rows[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada, não pode excluir.' });
    await pool.query('DELETE FROM consultas WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/confirmar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const consulta = await pool.query('SELECT status FROM consultas WHERE id = $1', [id]);
    if (consulta.rows.length === 0) return res.status(404).json({ error: 'Não encontrada' });
    if (consulta.rows[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada' });
    if (consulta.rows[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada' });
    if (consulta.rows[0].status === 'confirmada') return res.status(400).json({ error: 'Já confirmada' });
    await pool.query('UPDATE consultas SET status = $1 WHERE id = $2', ['confirmada', id]);
    res.json({ message: 'Confirmada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/processar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const consulta = await pool.query('SELECT status FROM consultas WHERE id = $1', [id]);
    if (consulta.rows.length === 0) return res.status(404).json({ error: 'Não encontrada' });
    if (consulta.rows[0].status === 'cancelada') return res.status(400).json({ error: 'Cancelada' });
    if (consulta.rows[0].status === 'realizada') return res.status(400).json({ error: 'Já realizada' });
    await pool.query('UPDATE consultas SET status = $1 WHERE id = $2', ['realizada', id]);
    res.json({ message: 'Realizada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;