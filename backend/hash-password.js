/*$2b$10$RZhNOnj0bdMpajeavrCnX.6t2Rah/8NeEwSbY4GDlHTj44klLvufe*/

const bcrypt = require('bcrypt');

async function run() {
  const hash = await bcrypt.hash('Admin123!', 10);

  console.log(hash);
}

run();