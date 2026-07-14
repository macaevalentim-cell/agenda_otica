const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const router = express.Router();

// ==================== LISTAR SOLICITAÇÕES ====================
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
      query += ' WHERE s.solicitado_por = $1';
      params.push(req.user.id);
    }
    query += ' ORDER BY s.criado_em DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(s => ({ ...s, data_consulta: formatDateToYYYYMMDD(s.data_consulta) })));
  } catch (error) {
    console.error('❌ Erro ao listar solicitações:', error);
    res.status(500).json({ error: 'Erro interno ao listar solicitações' });
  }
});

// ==================== CONTAR PENDENTES ====================
router.get('/pendentes/count', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as total FROM solicitacoes_consultas WHERE status = $1', ['pendente']);
    res.json({ total: parseInt(result.rows[0].total) });
  } catch (error) {
    console.error('❌ Erro ao contar pendentes:', error);
    res.status(500).json({ error: 'Erro interno ao contar pendentes' });
  }
});

// ==================== CRIAR SOLICITAÇÃO ====================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
      data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
      data_consulta, horario1, horario2, horario3,
      medico_id, medico_nome, observacoes, numero_pedido
    } = req.body;

    // ===== VALIDAÇÕES =====
    if (!data_nascimento) {
      return res.status(400).json({ error: 'Data de nascimento do paciente é obrigatória.' });
    }

    // Data/hora não retroativa (1º horário)
    const now = new Date();
    const dataHora1 = new Date(`${data_consulta}T${horario1}:00`);
    if (dataHora1 < now) {
      return res.status(400).json({ error: 'Não é permitido solicitar para data/hora no passado.' });
    }

    const diaSemana = new Date(data_consulta).getDay();
    const horariosConfig = await pool.query(
      `SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
      [medico_id, diaSemana]
    );
    if (horariosConfig.rows.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
    }

    const horariosSugeridos = [horario1, horario2, horario3].filter(h => h);
    for (const hor of horariosSugeridos) {
      let valido = false;
      for (const config of horariosConfig.rows) {
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
      const conflito = await pool.query(
        `SELECT id FROM solicitacoes_consultas
         WHERE data_consulta = $1 AND medico_id = $2 AND status = $3
         AND (horario_sugerido1 = $4 OR horario_sugerido2 = $5 OR horario_sugerido3 = $6)`,
        [data_consulta, medico_id, 'pendente', hor, hor, hor]
      );
      if (conflito.rows.length > 0) {
        return res.status(400).json({ error: `Horário ${hor} já possui solicitação pendente para este médico.` });
      }
    }

    // ===== GERENCIAR PACIENTE (cria/atualiza) =====
    if (paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) {
        // Atualizar dados
        await pool.query(
          `UPDATE clientes SET nome=$1, telefone=$2, email=$3, data_nascimento=$4,
           neurodivergente=$5, deficiencia_fisica=$6, encaixe=$7
           WHERE cpf=$8`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), data_nascimento,
           neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0,
           paciente_cpf]
        );
      } else {
        await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, data_nascimento,
           neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
        );
      }
    } else {
      // Criar paciente sem CPF (com data de nascimento obrigatória)
      await pool.query(
        `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [paciente_nome, paciente_telefone, toNull(paciente_email), null, data_nascimento,
         neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
      );
    }

    // ===== INSERIR SOLICITAÇÃO =====
    const result = await pool.query(
      `INSERT INTO solicitacoes_consultas
       (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta,
        horario_sugerido1, horario_sugerido2, horario_sugerido3,
        medico_id, medico_nome, observacoes, numero_pedido, solicitado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        paciente_nome, paciente_telefone, toNull(paciente_email), toNull(paciente_cpf),
        data_consulta, horario1, toNull(horario2), toNull(horario3),
        medico_id, medico_nome, toNull(observacoes), toNull(numero_pedido),
        req.user.id
      ]
    );
    res.status(201).json({ id: result.rows[0].id, message: 'Solicitação enviada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao criar solicitação:', error);
    res.status(500).json({ error: 'Erro interno ao criar solicitação' });
  }
});

// ==================== APROVAR/REJEITAR SOLICITAÇÃO ====================
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status, horario_escolhido } = req.body;
    if (!['aprovado', 'rejeitado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const solic = await pool.query('SELECT * FROM solicitacoes_consultas WHERE id = $1', [req.params.id]);
    if (solic.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const s = solic.rows[0];

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
      const horariosConfig = await pool.query(
        `SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
        [s.medico_id, diaSemana]
      );
      let valido = false;
      for (const config of horariosConfig.rows) {
        if (horario_escolhido >= config.hora_inicio && horario_escolhido < config.hora_fim) {
          valido = true;
          break;
        }
      }
      if (!valido) {
        return res.status(400).json({ error: 'Horário fora do expediente do médico.' });
      }

      // Verifica conflito com consultas existentes
      const conflito = await pool.query(
        `SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND status NOT IN ($4, $5)`,
        [s.data_consulta, horario_escolhido, s.medico_id, 'cancelada', 'realizada']
      );
      if (conflito.rows.length > 0) {
        return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
      }

      // ===== CRIAR CONSULTA A PARTIR DA SOLICITAÇÃO =====
      // Buscar data de nascimento do paciente (para o lembrete)
      const pacienteData = await pool.query(
        'SELECT data_nascimento FROM clientes WHERE cpf = $1 OR (nome = $2 AND telefone = $3)',
        [s.paciente_cpf, s.paciente_nome, s.paciente_telefone]
      );
      let dataNascimento = null;
      if (pacienteData.rows.length > 0) {
        dataNascimento = pacienteData.rows[0].data_nascimento;
      }

      const consultaResult = await pool.query(
        `INSERT INTO consultas
         (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, numero_pedido, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [s.paciente_nome, s.paciente_telefone, s.paciente_email, s.paciente_cpf,
         s.data_consulta, horario_escolhido, s.medico_id, s.medico_nome,
         s.observacoes, s.numero_pedido, s.solicitado_por]
      );
      const consultaId = consultaResult.rows[0].id;

      // Agendar lembrete com data de nascimento
      await agendarLembrete(
        consultaId,
        s.paciente_nome,
        s.paciente_telefone,
        dataNascimento,
        s.data_consulta,
        horario_escolhido,
        s.medico_nome,
        s.medico_id,
        s.solicitado_por,
        s.numero_pedido
      );

      await pool.query('UPDATE solicitacoes_consultas SET horario_escolhido = $1 WHERE id = $2', [horario_escolhido, req.params.id]);
    }

    await pool.query('UPDATE solicitacoes_consultas SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: `Solicitação ${status} com sucesso` });
  } catch (error) {
    console.error('❌ Erro ao atualizar solicitação:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar solicitação' });
  }
});

module.exports = router;