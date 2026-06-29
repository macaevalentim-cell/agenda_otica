const bcrypt = require('bcryptjs');
const senha = 'admin123';
bcrypt.hash(senha, 10, (err, hash) => {
    console.log('Hash para admin123:', hash);
});