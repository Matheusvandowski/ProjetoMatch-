require("dotenv").config();

console.log("🚀 Backend iniciando...");

const express = require("express");
const oracledb = require("oracledb");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

/* =================================
   CRIAR PASTA UPLOADS
================================= */

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

/* =================================
   MIDDLEWARES
================================= */

app.use(express.json({ limit: "50mb" }));

app.use(
  express.urlencoded({
    limit: "50mb",
    extended: true
  })
);

app.use(cors());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

/* =================================
   CONFIG UPLOAD
================================= */

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {

    const nome =
      Date.now() +
      "-" +
      Math.floor(Math.random() * 999999) +
      path.extname(file.originalname);

    cb(null, nome);

  }

});

const upload = multer({

  storage,

  limits: {
    fileSize: 10 * 1024 * 1024
  }

});

/* =================================
   CONEXÃO ORACLE
================================= */

async function conectar() {

  return await oracledb.getConnection({

    user: "system",
    password: "123456",
    connectString: "localhost:1521/XEPDB1"

  });

}

/* =================================
   EMAIL
================================= */

const transporter = nodemailer.createTransport({

  service: "gmail",

  auth: {

    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS

  }

});

/* =================================
   CADASTRO
================================= */

app.post("/cadastro", async (req, res) => {

  const {
    nome,
    ra,
    email,
    senha
  } = req.body;

  const token = uuidv4();

  try {

    const conn = await conectar();

    const usuarioExiste =
      await conn.execute(
        `SELECT id_usuario
         FROM usuario
         WHERE email = :email
         OR ra = :ra`,
        { email, ra }
      );

    if (usuarioExiste.rows.length > 0) {

      await conn.close();

      return res
        .status(400)
        .send("Usuário já cadastrado");

    }

    const hash =
      await bcrypt.hash(senha, 10);

    await conn.execute(
      `INSERT INTO usuario
      (
        id_usuario,
        nome_usuario,
        ra,
        email,
        senha,
        status,
        token,
        tipo
      )
      VALUES
      (
        usuario_seq.NEXTVAL,
        :nome,
        :ra,
        :email,
        :senha,
        0,
        :token,
        0
      )`,
      {
        nome,
        ra,
        email,
        senha: hash,
        token
      },
      { autoCommit: true }
    );

    await conn.close();

    const link =
      `http://localhost:5173/confirmar/${token}`;

    await transporter.sendMail({

      to: email,

      subject: "Confirmar cadastro",

      html:
        `
        <h2>Confirme sua conta</h2>

        <a href="${link}">
          Clique aqui para confirmar
        </a>
        `

    });

    res.send(
      "Cadastro realizado! Verifique seu e-mail."
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   CONFIRMAR EMAIL
================================= */

app.get("/confirmar/:token", async (req, res) => {

  const { token } = req.params;

  try {

    const conn = await conectar();

    const result =
      await conn.execute(
        `UPDATE usuario
         SET
           status = 1,
           token = NULL
         WHERE token = :token`,
        { token },
        { autoCommit: true }
      );

    await conn.close();

    if (result.rowsAffected === 0) {

      return res
        .status(400)
        .send("Token inválido");

    }

    res.send(
      "Conta confirmada com sucesso!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   LOGIN
================================= */

app.post("/login", async (req, res) => {

  const {
    email,
    senha
  } = req.body;

  try {

    const conn = await conectar();

    const result =
      await conn.execute(
        `SELECT
            id_usuario,
            nome_usuario,
            senha,
            status,
            tipo
         FROM usuario
         WHERE email = :email`,
        { email }
      );

    await conn.close();

    if (result.rows.length === 0) {

      return res
        .status(400)
        .send("Usuário não encontrado");

    }

    const id =
      result.rows[0][0];

    const nome =
      result.rows[0][1];

    const senhaBanco =
      result.rows[0][2];

    const status =
      result.rows[0][3];

    const tipo =
      result.rows[0][4];

    if (status !== 1) {

      return res
        .status(401)
        .send(
          "Usuário inativo ou e-mail não confirmado"
        );

    }

    const senhaOk =
      await bcrypt.compare(
        senha,
        senhaBanco
      );

    if (!senhaOk) {

      return res
        .status(401)
        .send("Senha inválida");

    }

    res.json({

      token: id,
      nome,
      tipo

    });

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   PERFIL
================================= */

app.get("/perfil/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const conn = await conectar();

    const result =
      await conn.execute(
        `SELECT
            nome_usuario,
            email,
            ra,
            telefone,
            esporte1,
            esporte2,
            esporte3,
            email_pessoal,
            notif_partidas,
            notif_tempo,
            tipo
         FROM usuario
         WHERE id_usuario = :id`,
        { id }
      );

    await conn.close();

    if (result.rows.length === 0) {

      return res
        .status(404)
        .send("Usuário não encontrado");

    }

    const user = result.rows[0];

    res.json({

      nome: user[0],
      email: user[1],
      ra: user[2],
      telefone: user[3],
      esporte1: user[4],
      esporte2: user[5],
      esporte3: user[6],
      email_pessoal: user[7],
      notif_partidas: user[8],
      notif_tempo: user[9],
      tipo: user[10]

    });

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   ATUALIZAR PERFIL
================================= */

app.put("/perfil/:id", async (req, res) => {

  const { id } = req.params;

  const {

    nome,
    telefone,
    esporte1,
    esporte2,
    esporte3,
    email_pessoal,
    notif_partidas,
    notif_tempo

  } = req.body;

  try {

    const conn = await conectar();

    await conn.execute(
      `UPDATE usuario
       SET
         nome_usuario = :nome,
         telefone = :telefone,
         esporte1 = :esporte1,
         esporte2 = :esporte2,
         esporte3 = :esporte3,
         email_pessoal = :email_pessoal,
         notif_partidas = :notif_partidas,
         notif_tempo = :notif_tempo
       WHERE id_usuario = :id`,
      {
        nome,
        telefone,
        esporte1,
        esporte2,
        esporte3,
        email_pessoal,
        notif_partidas,
        notif_tempo,
        id
      },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Perfil atualizado!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   ALTERAR SENHA
================================= */

app.put("/alterar-senha/:id", async (req, res) => {

  const { id } = req.params;

  const { senha } = req.body;

  try {

    const conn = await conectar();

    const hash =
      await bcrypt.hash(senha, 10);

    await conn.execute(
      `UPDATE usuario
       SET senha = :senha
       WHERE id_usuario = :id`,
      {
        senha: hash,
        id
      },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Senha alterada!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   LISTAR QUADRAS
================================= */

app.get("/quadras", async (req, res) => {

  try {

    const conn = await conectar();

    const result =
      await conn.execute(
        `SELECT
            id_quadra,
            nome_quadra,
            localizacao,
            disponibilidade,
            foto_url
         FROM quadra
         ORDER BY id_quadra`
      );

    await conn.close();

    const quadras =
      result.rows.map(q => ({

        id: q[0],
        nome: q[1],
        localizacao: q[2],
        disponibilidade: q[3],

        foto: q[4]
          ? `http://localhost:3000${q[4]}`
          : null

      }));

    res.json(quadras);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: err.message
    });

  }

});

/* =================================
   ADICIONAR QUADRA
================================= */

app.post(
  "/quadras",
  upload.single("foto"),
  async (req, res) => {

    const {
      nome,
      localizacao
    } = req.body;

    const foto =
      req.file
        ? `/uploads/${req.file.filename}`
        : null;

    try {

      const conn = await conectar();

      await conn.execute(
        `INSERT INTO quadra
        (
          id_quadra,
          nome_quadra,
          localizacao,
          disponibilidade,
          foto_url
        )
        VALUES
        (
          quadra_seq.NEXTVAL,
          :nome,
          :localizacao,
          1,
          :foto
        )`,
        {
          nome,
          localizacao,
          foto
        },
        { autoCommit: true }
      );

      await conn.close();

      res.send(
        "Quadra adicionada!"
      );

    } catch (err) {

      console.error(err);

      res.status(500).send(err.message);

    }

  }
);

/* =================================
   EDITAR QUADRA
================================= */

app.put(
  "/quadras/:id",
  upload.single("foto"),
  async (req, res) => {

    const { id } = req.params;

    const {
      nome,
      localizacao
    } = req.body;

    try {

      const conn = await conectar();

      const busca =
        await conn.execute(
          `SELECT foto_url
           FROM quadra
           WHERE id_quadra = :id`,
          { id }
        );

      let foto =
        busca.rows[0][0];

      if (req.file) {

        foto =
          `/uploads/${req.file.filename}`;

      }

      await conn.execute(
        `UPDATE quadra
         SET
           nome_quadra = :nome,
           localizacao = :localizacao,
           foto_url = :foto
         WHERE id_quadra = :id`,
        {
          nome,
          localizacao,
          foto,
          id
        },
        { autoCommit: true }
      );

      await conn.close();

      res.send(
        "Quadra atualizada!"
      );

    } catch (err) {

      console.error(err);

      res.status(500).send(err.message);

    }

  }
);

/* =================================
   INATIVAR QUADRA
================================= */

app.put("/quadras/inativar/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const conn = await conectar();

    await conn.execute(
      `UPDATE quadra
       SET disponibilidade = 0
       WHERE id_quadra = :id`,
      { id },
      { autoCommit: false }
    );

    await conn.execute(
      `DELETE FROM agendamento
       WHERE id_quadra = :id`,
      { id },
      { autoCommit: false }
    );

    await conn.commit();

    await conn.close();

    res.send(
      "Quadra inativada e horários cancelados!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   ATIVAR QUADRA
================================= */

app.put("/quadras/ativar/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const conn = await conectar();

    await conn.execute(
      `UPDATE quadra
       SET disponibilidade = 1
       WHERE id_quadra = :id`,
      { id },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Quadra ativada!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   EXCLUIR QUADRA
================================= */

app.delete("/quadras/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const conn = await conectar();

    await conn.execute(
      `DELETE FROM agendamento
       WHERE id_quadra = :id`,
      { id },
      { autoCommit: false }
    );

    const busca =
      await conn.execute(
        `SELECT foto_url
         FROM quadra
         WHERE id_quadra = :id`,
        { id }
      );

    if (
      busca.rows.length > 0 &&
      busca.rows[0][0]
    ) {

      const caminho =
        path.join(
          __dirname,
          busca.rows[0][0]
        );

      if (fs.existsSync(caminho)) {
        fs.unlinkSync(caminho);
      }

    }

    await conn.execute(
      `DELETE FROM quadra
       WHERE id_quadra = :id`,
      { id },
      { autoCommit: false }
    );

    await conn.commit();

    await conn.close();

    res.send("Quadra excluída!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   LISTAR USUÁRIOS
================================= */

app.get("/usuarios", async (req, res) => {

  try {

    const conn = await conectar();

    const result =
      await conn.execute(
        `SELECT
            id_usuario,
            nome_usuario,
            ra,
            email,
            status,
            tipo
         FROM usuario
         ORDER BY id_usuario`
      );

    await conn.close();

    const usuarios =
      result.rows.map(u => ({

        id: u[0],
        nome: u[1],
        ra: u[2],
        email: u[3],
        ativo: u[4],
        tipo: u[5]

      }));

    res.json(usuarios);

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   PROMOVER USUÁRIO
================================= */

app.put("/usuarios/promover/:id", async (req, res) => {

  const { id } = req.params;

  const {
    meuTipo,
    meuId
  } = req.body;

  try {

    if (meuTipo != 2) {

      return res
        .status(403)
        .send("Sem permissão");

    }

    if (Number(id) === Number(meuId)) {

      return res
        .status(400)
        .send("Você não pode alterar seu próprio usuário");

    }

    const conn = await conectar();

    await conn.execute(
      `UPDATE usuario
       SET tipo = 1
       WHERE id_usuario = :id`,
      { id },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Usuário promovido!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   INATIVAR USUÁRIO
================================= */

app.put("/usuarios/inativar/:id", async (req, res) => {

  const { id } = req.params;

  const {
    meuTipo,
    meuId
  } = req.body;

  try {

    const conn = await conectar();

    const busca =
      await conn.execute(
        `SELECT tipo
         FROM usuario
         WHERE id_usuario = :id`,
        { id }
      );

    if (busca.rows.length === 0) {

      await conn.close();

      return res
        .status(404)
        .send("Usuário não encontrado");

    }

    const tipoUsuario =
      busca.rows[0][0];

    if (Number(id) === Number(meuId)) {

      await conn.close();

      return res
        .status(400)
        .send("Você não pode inativar seu próprio usuário");

    }

    if (
      meuTipo == 1 &&
      tipoUsuario != 0
    ) {

      await conn.close();

      return res
        .status(403)
        .send("Sem permissão");

    }

    if (
      meuTipo != 1 &&
      meuTipo != 2
    ) {

      await conn.close();

      return res
        .status(403)
        .send("Sem permissão");

    }

    await conn.execute(
      `UPDATE usuario
       SET status = 0
       WHERE id_usuario = :id`,
      { id },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Usuário inativado!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   DESPROMOVER USUÁRIO
================================= */

app.put("/usuarios/despromover/:id", async (req, res) => {

  const { id } = req.params;

  const {
    meuTipo,
    meuId
  } = req.body;

  try {

    if (meuTipo != 2) {

      return res
        .status(403)
        .send("Sem permissão");

    }

    if (Number(id) === Number(meuId)) {

      return res
        .status(400)
        .send("Você não pode alterar seu próprio usuário");

    }

    const conn = await conectar();

    const busca =
      await conn.execute(
        `SELECT tipo
         FROM usuario
         WHERE id_usuario = :id`,
        { id }
      );

    if (busca.rows.length === 0) {

      await conn.close();

      return res
        .status(404)
        .send("Usuário não encontrado");

    }

    const tipoUsuario =
      busca.rows[0][0];

    if (tipoUsuario == 2) {

      await conn.close();

      return res
        .status(403)
        .send("Não é possível despromover outro MASTER");

    }

    await conn.execute(
      `UPDATE usuario
       SET tipo = 0
       WHERE id_usuario = :id`,
      { id },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Usuário despromovido!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   ATIVAR USUÁRIO
================================= */

app.put("/usuarios/ativar/:id", async (req, res) => {

  const { id } = req.params;

  const {
    meuTipo,
    meuId
  } = req.body;

  try {

    const conn = await conectar();

    const busca =
      await conn.execute(
        `SELECT tipo
         FROM usuario
         WHERE id_usuario = :id`,
        { id }
      );

    if (busca.rows.length === 0) {

      await conn.close();

      return res
        .status(404)
        .send("Usuário não encontrado");

    }

    const tipoUsuario =
      busca.rows[0][0];

    if (Number(id) === Number(meuId)) {

      await conn.close();

      return res
        .status(400)
        .send("Você não pode alterar seu próprio usuário");

    }

    if (
      meuTipo == 1 &&
      tipoUsuario != 0
    ) {

      await conn.close();

      return res
        .status(403)
        .send("Sem permissão");

    }

    if (
      meuTipo != 1 &&
      meuTipo != 2
    ) {

      await conn.close();

      return res
        .status(403)
        .send("Sem permissão");

    }

    await conn.execute(
      `UPDATE usuario
       SET status = 1
       WHERE id_usuario = :id`,
      { id },
      { autoCommit: true }
    );

    await conn.close();

    res.send("Usuário ativado!");

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   ATUALIZAR PARTIDA
================================= */

app.put("/partida/:id", async (req, res) => {

  let conn;

  try {

    const { id } = req.params;

    const {
      esporte,
      partida_aberta
    } = req.body;

    conn = await conectar();

    await conn.execute(
      `
      UPDATE agendamento
      SET
        esporte = :esporte,
        partida_aberta = :partida_aberta
      WHERE id_agendamento = :id
      `,
      {
        esporte,
        partida_aberta,
        id: Number(id)
      },
      {
        autoCommit: true
      }
    );

    res.send(
      "Partida atualizada!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   PARTICIPANTES DA PARTIDA
================================= */

app.get("/partida/:id/participantes", async (req, res) => {

  let conn;

  try {

    const { id } = req.params;

    conn = await conectar();

    const result =
      await conn.execute(
        `
        SELECT
          u.id_usuario,
          u.nome_usuario
        FROM partida_participante pp
        JOIN usuario u
          ON u.id_usuario = pp.id_usuario
        WHERE pp.id_agendamento = :id
        `,
        {
          id: Number(id)
        }
      );

    const participantes =
      result.rows.map(p => ({

        id: p[0],
        nome: p[1]

      }));

    res.json(participantes);

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   ENTRAR EM PARTIDA
================================= */

app.post("/partida/:id/entrar", async (req, res) => {

  let conn;

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res
        .status(401)
        .send("Token não enviado");

    }

    const token =
      authHeader.split(" ")[1];

    const idUsuario =
      Number(token);

    const { id } = req.params;

    conn = await conectar();

    const partida =
      await conn.execute(
        `
        SELECT partida_aberta
        FROM agendamento
        WHERE id_agendamento = :id
        `,
        {
          id: Number(id)
        }
      );

    if (partida.rows.length === 0) {

      return res
        .status(404)
        .send("Partida não encontrada");

    }

    if (partida.rows[0][0] !== 1) {

      return res
        .status(403)
        .send("Partida fechada");

    }

    const existe =
      await conn.execute(
        `
        SELECT id_participante
        FROM partida_participante
        WHERE id_agendamento = :id
        AND id_usuario = :usuario
        `,
        {
          id: Number(id),
          usuario: idUsuario
        }
      );

    if (existe.rows.length > 0) {

      return res
        .status(400)
        .send("Você já participa");

    }

    await conn.execute(
      `
      INSERT INTO partida_participante
      (
        id_participante,
        id_agendamento,
        id_usuario
      )
      VALUES
      (
        partida_participante_seq.NEXTVAL,
        :id,
        :usuario
      )
      `,
      {
        id: Number(id),
        usuario: idUsuario
      },
      {
        autoCommit: true
      }
    );

    res.send(
      "Entrou na partida!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   MINHAS RESERVAS
================================= */

app.get("/minhas-reservas", async (req, res) => {

  let conn;

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res
        .status(401)
        .send("Token não enviado");

    }

    const token =
      authHeader.split(" ")[1];

    const idUsuario =
      Number(token);

    conn = await conectar();

    const result =
      await conn.execute(
        `
        SELECT
          id_agendamento,
          id_quadra,
          TO_CHAR(
            dt_agendamento,
            'YYYY-MM-DD'
          ) AS data_reserva,
          hr_agendamento
        FROM agendamento
        WHERE id_usuario = :id
        ORDER BY
          dt_agendamento,
          hr_agendamento
        `,
        {
          id: idUsuario
        }
      );

    const reservas =
      result.rows.map(r => ({

        ID_AGENDAMENTO: r[0],

        ID_QUADRA: r[1],

        DT_AGENDAMENTO: r[2],

        HR_AGENDAMENTO:
          String(r[3]).slice(0, 5)

      }));

    res.json(reservas);

  } catch (err) {

    console.error(
      "ERRO MINHAS RESERVAS:",
      err
    );

    res.status(500).json({
      erro: err.message
    });

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   CANCELAR RESERVA
================================= */

app.delete("/cancelar-reserva/:id", async (req, res) => {

  let conn;

  try {

    const { id } = req.params;

    conn = await conectar();

    await conn.execute(
      `
      DELETE FROM agendamento
      WHERE id_agendamento = :id
      `,
      {
        id: Number(id)
      },
      {
        autoCommit: true
      }
    );

    res.send(
      "Reserva cancelada!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(
      err.message
    );

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   RESERVAR QUADRA
================================= */

app.post("/reservar", async (req, res) => {

  let conn;

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res
        .status(401)
        .send("Token não enviado");

    }

    const token =
      authHeader.split(" ")[1];

    const idUsuario =
      Number(token);

    const {
      id_quadra,
      dt_agendamento,
      hr_agendamento
    } = req.body;

    conn = await conectar();

    const hora =
      String(hr_agendamento)
        .slice(0, 5);

    /* ================================
       VERIFICA MANUTENÇÃO
    ================================= */

    const manutencao =
      await conn.execute(
        `
        SELECT id_manutencao
        FROM manutencao
        WHERE id_quadra = :id_quadra
        AND TO_DATE(
              :dt_agendamento,
              'YYYY-MM-DD'
            )
            BETWEEN data_inicio
            AND data_fim
        `,
        {
          id_quadra:
            Number(id_quadra),

          dt_agendamento
        }
      );

    if (manutencao.rows.length > 0) {

      return res
        .status(400)
        .send(
          "Quadra em manutenção nesta data"
        );

    }

    /* ================================
       VERIFICA CONFLITO
    ================================= */

    const conflito =
      await conn.execute(
        `
        SELECT id_agendamento
        FROM agendamento
        WHERE id_quadra = :id_quadra
        AND TO_CHAR(
              dt_agendamento,
              'YYYY-MM-DD'
            ) = :dt_agendamento
        AND hr_agendamento = :hora
        `,
        {
          id_quadra:
            Number(id_quadra),

          dt_agendamento,

          hora
        }
      );

    if (conflito.rows.length > 0) {

      return res
        .status(400)
        .send(
          "Horário já reservado"
        );

    }

    /* ================================
       GERAR ID AGENDAMENTO
    ================================= */

    const seq =
      await conn.execute(
        `
        SELECT agendamento_seq.NEXTVAL
        FROM dual
        `
      );

    const idAgendamento =
      seq.rows[0][0];

    /* ================================
       INSERT
    ================================= */

    await conn.execute(
      `
      INSERT INTO agendamento
      (
        id_agendamento,
        dt_agendamento,
        hr_agendamento,
        status,
        id_usuario,
        id_quadra
      )
      VALUES
      (
        :id_agendamento,
        TO_DATE(
          :dt_agendamento,
          'YYYY-MM-DD'
        ),
        :hora,
        1,
        :id_usuario,
        :id_quadra
      )
      `,
      {
        id_agendamento:
          idAgendamento,

        dt_agendamento,

        hora,

        id_usuario:
          idUsuario,

        id_quadra:
          Number(id_quadra)
      },
      {
        autoCommit: true
      }
    );

    /* ================================
       RETORNO
    ================================= */

    res.json({

      mensagem:
        "Reserva realizada!",

      id_agendamento:
        idAgendamento

    });

  } catch (err) {

    console.error(
      "ERRO RESERVAR:",
      err
    );

    res.status(500).send(
      err.message
    );

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   LISTAR AGENDAMENTOS
================================= */

app.get(
  "/agendamentos/:id_quadra/:data",
  async (req, res) => {

    let conn;

    try {

      const {
        id_quadra,
        data
      } = req.params;

      conn = await conectar();

      const result =
        await conn.execute(
          `
          SELECT hr_agendamento
          FROM agendamento
          WHERE id_quadra = :id_quadra
          AND TO_CHAR(
                dt_agendamento,
                'YYYY-MM-DD'
              ) = :data
          `,
          {
            id_quadra:
              Number(id_quadra),

            data
          }
        );

      const horarios =
        result.rows.map(r =>
          String(r[0])
            .trim()
            .slice(0, 5)
        );

      res.json(horarios);

    } catch (err) {

      console.error(err);

      res.status(500).send(
        err.message
      );

    } finally {

      if (conn) {

        try {
          await conn.close();
        } catch (err) {
          console.error(err);
        }

      }

    }

  }
);

/* =================================
   HORÁRIOS DISPONÍVEIS
================================= */

app.get(
  "/horarios/:data/:quadra",
  async (req, res) => {

    let conn;

    try {

      const {
        data,
        quadra
      } = req.params;

      conn = await conectar();

      const result =
        await conn.execute(
          `
          SELECT hr_agendamento
          FROM agendamento
          WHERE id_quadra = :quadra
          AND TO_CHAR(
                dt_agendamento,
                'YYYY-MM-DD'
              ) = :data
          `,
          {
            quadra: Number(quadra),
            data
          }
        );

      const ocupados =
        result.rows.map(r =>
          String(r[0])
            .trim()
            .slice(0, 5)
        );

      const todosHorarios = [
        "08:00",
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
        "19:00",
        "20:00",
        "21:00"
      ];

      const horarios =
        todosHorarios.map(hora => ({

          horario: hora,

          disponivel:
            !ocupados.includes(hora)

        }));

      res.json(horarios);

    } catch (err) {

      console.error(err);

      res.status(500).send(
        err.message
      );

    } finally {

      if (conn) {

        try {
          await conn.close();
        } catch (err) {
          console.error(err);
        }

      }

    }

  }
);

/* =================================
   BUSCAR PARTIDA
================================= */

app.get("/partida/:id", async (req, res) => {

  let conn;

  try {

    const { id } = req.params;

    conn = await conectar();

    const result =
      await conn.execute(
        `
        SELECT
          id_agendamento,
          id_quadra,
          TO_CHAR(
            dt_agendamento,
            'YYYY-MM-DD'
          ) AS data_reserva,
          hr_agendamento
        FROM agendamento
        WHERE id_agendamento = :id
        `,
        {
          id: Number(id)
        }
      );

    if (result.rows.length === 0) {

      return res
        .status(404)
        .send("Partida não encontrada");

    }

    const partida = result.rows[0];

    res.json({

      id_agendamento: partida[0],

      id_quadra: partida[1],

      data: partida[2],

      horario: String(partida[3]).slice(0, 5)

    });

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {

      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }

    }

  }

});

/* =================================
   TODAS RESERVAS
================================= */

app.get("/todas-reservas", async (req, res) => {

  let conn;

  try {

    conn = await conectar();

    const result =
      await conn.execute(
        `
        SELECT
          a.id_agendamento,
          q.nome_quadra,
          u.nome_usuario,
          TO_CHAR(
            a.dt_agendamento,
            'YYYY-MM-DD'
          ),
          a.hr_agendamento
        FROM agendamento a
        JOIN quadra q
          ON q.id_quadra = a.id_quadra
        JOIN usuario u
          ON u.id_usuario = a.id_usuario
        ORDER BY
          a.dt_agendamento,
          a.hr_agendamento
        `
      );

    const reservas =
      result.rows.map(r => ({

        id: r[0],

        quadra: r[1],

        usuario: r[2],

        data: r[3],

        horario:
          String(r[4]).slice(0,5)

      }));

    res.json(reservas);

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {
      await conn.close();
    }

  }

});

/* =================================
   MANUTENÇÃO QUADRA
================================= */

app.post("/manutencao", async (req, res) => {

  let conn;

  try {

    const {
      id_quadra,
      data_inicio,
      data_fim,
      motivo
    } = req.body;

    conn = await conectar();

    await conn.execute(
      `
      INSERT INTO manutencao
      (
        id_manutencao,
        id_quadra,
        data_inicio,
        data_fim,
        motivo
      )
      VALUES
      (
        manutencao_seq.NEXTVAL,
        :id_quadra,
        TO_DATE(:data_inicio, 'YYYY-MM-DD'),
        TO_DATE(:data_fim, 'YYYY-MM-DD'),
        :motivo
      )
      `,
      {
        id_quadra,
        data_inicio,
        data_fim,
        motivo
      },
      {
        autoCommit: false
      }
    );

    const reservas =
      await conn.execute(
        `
        SELECT
          a.id_agendamento,
          u.email
        FROM agendamento a
        JOIN usuario u
          ON u.id_usuario = a.id_usuario
        WHERE a.id_quadra = :id_quadra
        AND a.dt_agendamento
          BETWEEN
            TO_DATE(:data_inicio, 'YYYY-MM-DD')
          AND
            TO_DATE(:data_fim, 'YYYY-MM-DD')
        `,
        {
          id_quadra,
          data_inicio,
          data_fim
        }
      );

    for (const r of reservas.rows) {

      const idAgendamento = r[0];
      const email = r[1];

      await transporter.sendMail({

        to: email,

        subject: "Reserva cancelada",

        html: `
          <h2>Reserva cancelada</h2>

          <p>
            Sua reserva foi cancelada
            devido a manutenção da quadra.
          </p>
        `

      });

      await conn.execute(
        `
        DELETE FROM agendamento
        WHERE id_agendamento = :id
        `,
        {
          id: idAgendamento
        },
        {
          autoCommit: false
        }
      );

    }

    await conn.commit();

    res.send(
      "Manutenção aplicada!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  } finally {

    if (conn) {
      await conn.close();
    }

  }

});

/* =================================
   REPORTAR ATIVIDADE
================================= */

app.post("/reportar-atividade", async (req, res) => {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res
        .status(401)
        .send("Token não enviado");

    }

    const token =
      authHeader.split(" ")[1];

    const idUsuario =
      Number(token);

    const {
      tipo,
      descricao
    } = req.body;

    const conn = await conectar();

    const result =
      await conn.execute(
        `
        SELECT
          nome_usuario,
          email
        FROM usuario
        WHERE id_usuario = :id
        `,
        {
          id: idUsuario
        }
      );

    await conn.close();

    if (result.rows.length === 0) {

      return res
        .status(404)
        .send("Usuário não encontrado");

    }

    const nomeUsuario =
      result.rows[0][0];

    const emailUsuario =
      result.rows[0][1];

    await transporter.sendMail({

      from: process.env.EMAIL_USER,

      to: "realmatheus11@gmail.com",

      subject: "Novo reporte de atividade",

      html: `
        <h2>Novo reporte recebido</h2>

        <p>
          <strong>Usuário:</strong>
          ${nomeUsuario}
        </p>

        <p>
          <strong>Email:</strong>
          ${emailUsuario}
        </p>

        <p>
          <strong>Tipo:</strong>
          ${tipo}
        </p>

        <p>
          <strong>Descrição:</strong>
        </p>

        <p>
          ${descricao}
        </p>
      `

    });

    res.send(
      "Reporte enviado com sucesso!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }
});

/* =================================
   CONVIDAR AMIGO PARA PARTIDA
================================= */

app.post("/convidar", async (req, res) => {

  try {

    const {
      email,
      partidaId
    } = req.body;

    const link =
      `http://localhost:5173/partida/${partidaId}`;

    await transporter.sendMail({

      from: process.env.EMAIL_USER,

      to: email,

      subject: "Convite para partida",

      html: `
        <h2>Você foi convidado para uma partida!</h2>

        <p>
          Clique no link abaixo para acessar:
        </p>

        <a href="${link}">
          Entrar na Partida
        </a>
      `

    });

    res.send(
      "Convite enviado com sucesso!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

/* =================================
   CONVIDAR AMIGO PARA PARTIDA
================================= */

app.post("/convidar", async (req, res) => {

  try {

    const {
      email,
      partidaId
    } = req.body;

    const link =
      `http://localhost:5173/partida/${partidaId}`;

    await transporter.sendMail({

      from: process.env.EMAIL_USER,

      to: email,

      subject: "Convite para partida",

      html: `
        <h2>Você foi convidado para uma partida!</h2>

        <p>
          Clique no link abaixo para acessar:
        </p>

        <a href="${link}">
          Entrar na Partida
        </a>
      `

    });

    res.send(
      "Convite enviado com sucesso!"
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});


/* =================================
   SERVIDOR
================================= */

app.listen(3000, () => {

  console.log(
    "✅ API rodando em http://localhost:3000"
  );

});