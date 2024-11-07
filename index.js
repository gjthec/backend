const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const fs = require("fs");
const cors = require("cors");
const { log } = require("console");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Configuração do pool de conexões com o PostgreSQL
const pool = new Pool({
    host: "jocularly-honest-tapir.data-1.use1.tembo.io",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: "TDBRtHFddwa6YGMO",
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

const upload = multer({ dest: "uploads/" });

// Rota para cadastrar um novo cliente
app.post("/api/clients", async (req, res) => {
    const {
        cpfCnpj,
        razaoSocial,
        bairro,
        cidade,
        estado,
        telefone,
        email,
        cep,
        dataInclusao,
        endereco,
        situacao,
    } = req.body;

    try {
        const client = await pool.connect();
        const query = `
      INSERT INTO clients (cpfcnpj, razaosocial, bairro, cidade, estado, telefone, email, cep, datainclusao, endereco, situacao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
        const values = [
            cpfCnpj,
            razaoSocial,
            bairro,
            cidade,
            estado,
            telefone,
            email,
            cep,
            dataInclusao,
            endereco,
            situacao,
        ];
        const result = await client.query(query, values);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao cadastrar cliente:", error.message);
        res.status(500).send("Erro ao cadastrar cliente.");
    }
});

// Rota para obter todos os clientes
app.get("/api/clients", async (req, res) => {
    try {
        const client = await pool.connect();
        const query = `
      SELECT clients.id, clients.cpfcnpj, clients.razaosocial, clients.cidade, clients.estado, clients.situacao,
             documentos_pdf.nome_arquivo
      FROM clients
      LEFT JOIN documentos_pdf ON clients.id = documentos_pdf.client_id
    `;
        const result = await client.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao buscar clientes:", error.message);
        res.status(500).send("Erro ao buscar clientes.");
    }
});

// Rota para obter um cliente específico pelo ID
app.get("/api/clients/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const client = await pool.connect();
        const result = await client.query(
            "SELECT * FROM clients WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).send("Cliente não encontrado.");
        } else {
            res.json(result.rows[0]);
        }
    } catch (error) {
        console.error("Erro ao buscar cliente:", error.message);
        res.status(500).send("Erro ao buscar cliente.");
    }
});

// Rota para excluir um cliente pelo ID
app.delete("/api/clients/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const client = await pool.connect();
        const result = await client.query(
            "DELETE FROM clients WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).send("Cliente não encontrado.");
        } else {
            res.send(`Cliente com ID ${id} excluído com sucesso.`);
        }
    } catch (error) {
        console.error("Erro ao excluir cliente:", error.message);
        res.status(500).send("Erro ao excluir cliente.");
    }
});

app.post("/api/upload", upload.single("arquivoPdf"), async (req, res) => {
    const caminhoPdf = req.file.path;
    const nomeArquivo = req.file.originalname;
    const { clientId, cpfCnpj } = req.body; // Obtém clientId e cpfCnpj do corpo da requisição

    try {
        const client = await pool.connect();
        const conteudoPdf = fs.readFileSync(caminhoPdf);

        // Inclua cpfCnpj na inserção do documento PDF
        const query =
            "INSERT INTO documentos_pdf (nome_arquivo, conteudo, client_id, cpfCnpj) VALUES ($1, $2, $3, $4)";
        await client.query(query, [
            nomeArquivo,
            conteudoPdf,
            clientId,
            cpfCnpj,
        ]);

        fs.unlinkSync(caminhoPdf); // Exclui o arquivo local após o upload

        res.send(
            `Arquivo '${nomeArquivo}' inserido com sucesso no banco de dados.`
        );
    } catch (error) {
        console.error("Erro ao inserir o arquivo:", error.message);
        res.status(500).send("Erro ao inserir o arquivo no banco de dados.");
    } finally {
        client.release();
    }
});
// Rota para download do PDF pelo cpfCnpj
app.get("/api/download/:cpfCnpj", async (req, res) => {
    const { cpfCnpj } = req.params;

    try {
        // Busca o PDF pelo cpfCnpj no banco de dados
        const query =
            "SELECT nome_arquivo, conteudo FROM documentos_pdf WHERE cpfcnpj = $1";
        const result = await pool.query(query, [cpfCnpj]);

        if (result.rows.length === 0) {
            return res
                .status(404)
                .send("Nenhum PDF encontrado para o CPF/CNPJ especificado.");
        }

        const { nome_arquivo, conteudo } = result.rows[0];

        // Cria um caminho temporário para salvar o arquivo
        const tempPath = `./uploads/${nome_arquivo}`;
        fs.writeFileSync(tempPath, conteudo);

        // Envia o arquivo para o cliente
        res.download(tempPath, nome_arquivo, (err) => {
            if (err) {
                console.error("Erro ao enviar o arquivo:", err);
                res.status(500).send("Erro ao enviar o arquivo.");
            }

            // Remove o arquivo temporário após o download
            fs.unlinkSync(tempPath);
        });
    } catch (error) {
        console.error("Erro ao buscar o arquivo:", error.message);
        res.status(500).send("Erro ao buscar o arquivo.");
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
