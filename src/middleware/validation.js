const { body, validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(v => v.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
  };
};

const loginValidation = [
  body('username').notEmpty().trim().escape(),
  body('password').notEmpty()
];

const consultaValidation = [
  body('paciente_nome').notEmpty().trim().escape(),
  body('paciente_telefone').notEmpty().trim().escape(),
  body('data_consulta').notEmpty().isDate(),
  body('horario').notEmpty().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('medico_id').isInt(),
  body('medico_nome').notEmpty().trim().escape()
];

const medicoValidation = [
  body('nome').notEmpty().trim().escape(),
  body('crm').notEmpty().trim().escape(),
  body('especialidade').notEmpty().trim().escape()
];

const pacienteValidation = [
  body('nome').notEmpty().trim().escape(),
  body('telefone').notEmpty().trim().escape()
];

module.exports = { validate, loginValidation, consultaValidation, medicoValidation, pacienteValidation };