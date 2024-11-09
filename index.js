const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const fs = require("fs");
const cors = require("cors");

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
        const result = await pool.query(query, values);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao cadastrar cliente:", error.message);
        res.status(500).send("Erro ao cadastrar cliente.");
    }
});

// Rota para obter todos os clientes
app.get("/api/clients", async (req, res) => {
    try {
        const query = `
          SELECT clients.id, clients.cpfcnpj, clients.razaosocial, clients.cidade, clients.estado, clients.situacao,
                 documentos_pdf.nome_arquivo
          FROM clients
          LEFT JOIN documentos_pdf ON clients.id = documentos_pdf.client_id
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao buscar clientes:", error.message);
        res.status(500).send("Erro ao buscar clientes.");
    }
});
// Nova rota para obter cliente por CPF/CNPJ e retornar apenas `razaosocial` e `situacao`
app.get("/api/clients/by-cpfcnpj/:cpfcnpj", async (req, res) => {
    const { cpfcnpj } = req.params;

    try {
        const result = await pool.query(
            "SELECT razaosocial, situacao FROM clients WHERE cpfcnpj = $1",
            [cpfcnpj]
        );

        if (result.rows.length === 0) {
            res.status(404).send("Cliente não encontrado.");
        } else {
            res.json(result.rows[0]);
        }
    } catch (error) {
        console.error("Erro ao buscar cliente por CPF/CNPJ:", error.message);
        res.status(500).send("Erro ao buscar cliente por CPF/CNPJ.");
    }
});
// Rota para obter um cliente específico pelo ID
app.get("/api/clients/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("SELECT * FROM clients WHERE id = $1", [
            id,
        ]);

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

// Rota para atualizar um cliente pelo ID
app.put("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    const { cpfcnpj, razaosocial, cidade, estado, situacao } = req.body;

    try {
        const query = `
            UPDATE clients
            SET 
                cpfcnpj = COALESCE($1, cpfcnpj), 
                razaosocial = COALESCE($2, razaosocial), 
                cidade = COALESCE($3, cidade), 
                estado = COALESCE($4, estado), 
                situacao = COALESCE($5, situacao)
            WHERE id = $6
            RETURNING *;
        `;

        const values = [cpfcnpj, razaosocial, cidade, estado, situacao, id];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            res.status(404).send("Cliente não encontrado.");
        } else {
            res.json(result.rows[0]);
        }
    } catch (error) {
        console.error("Erro ao atualizar cliente:", error.message);
        res.status(500).send("Erro ao atualizar cliente.");
    }
});

// Rota para excluir um cliente pelo ID
app.delete("/api/clients/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
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
    const { clientId, cpfCnpj } = req.body;

    try {
        const conteudoPdf = fs.readFileSync(caminhoPdf);

        const query =
            "INSERT INTO documentos_pdf (nome_arquivo, conteudo, client_id, cpfCnpj) VALUES ($1, $2, $3, $4)";
        await pool.query(query, [nomeArquivo, conteudoPdf, clientId, cpfCnpj]);

        fs.unlinkSync(caminhoPdf); // Exclui o arquivo local após o upload

        res.send(
            `Arquivo '${nomeArquivo}' inserido com sucesso no banco de dados.`
        );
    } catch (error) {
        console.error("Erro ao inserir o arquivo:", error.message);
        res.status(500).send("Erro ao inserir o arquivo no banco de dados.");
    }
});

// Rota para download do PDF pelo cpfCnpj
app.get("/api/download/:cpfCnpj", async (req, res) => {
    const { cpfCnpj } = req.params;

    try {
        const query =
            "SELECT nome_arquivo, conteudo FROM documentos_pdf WHERE cpfcnpj = $1";
        const result = await pool.query(query, [cpfCnpj]);

        if (result.rows.length === 0) {
            return res
                .status(404)
                .send("Nenhum PDF encontrado para o CPF/CNPJ especificado.");
        }

        const { nome_arquivo, conteudo } = result.rows[0];

        const tempPath = `./uploads/${nome_arquivo}`;
        fs.writeFileSync(tempPath, conteudo);

        res.download(tempPath, nome_arquivo, (err) => {
            if (err) {
                console.error("Erro ao enviar o arquivo:", err);
                res.status(500).send("Erro ao enviar o arquivo.");
            }

            fs.unlinkSync(tempPath);
        });
    } catch (error) {
        console.error("Erro ao buscar o arquivo:", error.message);
        res.status(500).send("Erro ao buscar o arquivo.");
    }
});
// Rota para atualizar um cliente com upload de PDF
app.put(
    "/api/clients/:id/upload-pdf",
    upload.single("arquivoPdf"),
    async (req, res) => {
        const { id } = req.params;
        const { cpfCnpj, razaoSocial, cidade, estado, situacao } = req.body;
        const nomeArquivo = req.file?.originalname;
        const caminhoPdf = req.file?.path;

        try {
            // Atualiza os dados do cliente na tabela `clients`
            const client = await pool.query(
                `
                UPDATE clients
                SET cpfcnpj = COALESCE($1, cpfcnpj), 
                    razaosocial = COALESCE($2, razaosocial), 
                    cidade = COALESCE($3, cidade), 
                    estado = COALESCE($4, estado), 
                    situacao = COALESCE($5, situacao)
                WHERE id = $6
                RETURNING *;
                `,
                [cpfCnpj, razaoSocial, cidade, estado, situacao, id]
            );

            if (client.rows.length === 0) {
                return res.status(404).send("Cliente não encontrado.");
            }

            // Se houver um PDF, verifica se existe um registro na tabela `documentos_pdf`
            if (nomeArquivo && caminhoPdf) {
                const conteudoPdf = fs.readFileSync(caminhoPdf);

                const pdfExists = await pool.query(
                    `SELECT * FROM documentos_pdf WHERE client_id = $1`,
                    [id]
                );

                if (pdfExists.rows.length > 0) {
                    // Atualiza o PDF existente se já houver um registro
                    await pool.query(
                        `UPDATE documentos_pdf 
                         SET nome_arquivo = $1, conteudo = $2, cpfcnpj = $3
                         WHERE client_id = $4 
                         RETURNING *;`,
                        [nomeArquivo, conteudoPdf, cpfCnpj, id]
                    );
                } else {
                    // Insere um novo registro em `documentos_pdf` se não existir
                    await pool.query(
                        `INSERT INTO documentos_pdf (nome_arquivo, conteudo, client_id, cpfcnpj)
                         VALUES ($1, $2, $3, $4) 
                         RETURNING *;`,
                        [nomeArquivo, conteudoPdf, id, cpfCnpj]
                    );
                }

                fs.unlinkSync(caminhoPdf); // Remove o arquivo local
            }

            res.json(client.rows[0]);
        } catch (error) {
            console.error(
                "Erro ao atualizar cliente e enviar PDF:",
                error.message
            );
            res.status(500).send("Erro ao atualizar cliente e enviar PDF.");
        }
    }
);

// Rota para excluir o PDF pelo cpfCnpj
app.delete("/api/delete-pdf/:cpfCnpj", async (req, res) => {
    const { cpfCnpj } = req.params;

    try {
        const querySelect =
            "SELECT nome_arquivo FROM documentos_pdf WHERE cpfcnpj = $1";
        const result = await pool.query(querySelect, [cpfCnpj]);

        if (result.rows.length === 0) {
            return res
                .status(404)
                .send("Nenhum PDF encontrado para o CPF/CNPJ especificado.");
        }

        const queryDelete = "DELETE FROM documentos_pdf WHERE cpfcnpj = $1";
        await pool.query(queryDelete, [cpfCnpj]);

        res.send("PDF excluído com sucesso.");
    } catch (error) {
        console.error("Erro ao excluir o arquivo PDF:", error.message);
        res.status(500).send("Erro ao excluir o arquivo PDF.");
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
