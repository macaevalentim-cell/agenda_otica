const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Buscar horários de um médico
router.get('/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM medico_horarios WHERE medico_id = $1 ORDER BY dia_semana, hora_inicio',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar horário
router.post('/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { dia_semana, hora_inicio, hora_fim, intervalo } = req.body;
    const result = await pool.query(
      'INSERT INTO medico_horarios (medico_id, dia_semana, hora_inicio, hora_fim, intervalo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [medicoId, dia_semana, hora_inicio, hora_fim, intervalo || 30]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar horário
router.put('/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { dia_semana, hora_inicio, hora_fim, intervalo, ativo } = req.body;
    const result = await pool.query(
      'UPDATE medico_horarios SET dia_semana=$1, hora_inicio=$2, hora_fim=$3, intervalo=$4, ativo=$5 WHERE id=$6 RETURNING id',
      [dia_semana, hora_inicio, hora_fim, intervalo || 30, ativo !== undefined ? ativo : true, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Horário não encontrado' });
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir horário
router.delete('/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM medico_horarios WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Horário não encontrado' });
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar horários disponíveis para uma data
router.get('/medicos/:id/horarios/disponiveis', authenticateToken, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'Data é obrigatória' });

    const diaSemana = new Date(data).getDay();
    const horariosConfig = await pool.query(
      `SELECT hora_inicio, hora_fim, intervalo FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
      [medicoId, diaSemana]
    );
    if (horariosConfig.rows.length === 0) {
      return res.json([]);
    }

    const todosHorarios = [];
    for (const config of horariosConfig.rows) {
      const inicio = config.hora_inicio;
      const fim = config.hora_fim;
      const intervalo = config.intervalo || 30;
      let current = new Date(`2000-01-01T${inicio}`);
      const end = new Date(`2000-01-01T${fim}`);
      while (current < end) {
        const h = current.getHours().toString().padStart(2, '0');
        const m = current.getMinutes().toString().padStart(2, '0');
        todosHorarios.push(`${h}:${m}`);
        current.setMinutes(current.getMinutes() + intervalo);
      }
    }

    const horariosUnicos = [...new Set(todosHorarios)];
    const consultasExistentes = await pool.query(
      'SELECT horario FROM consultas WHERE medico_id = $1 AND data_consulta = $2 AND status NOT IN ($3, $4)',
      [medicoId, data, 'cancelada', 'realizada']
    );
    const horariosOcupados = consultasExistentes.rows.map(r => r.horario);
    const disponiveis = horariosUnicos.filter(h => !horariosOcupados.includes(h));
    res.json(disponiveis.map(h => ({ horario: h })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;