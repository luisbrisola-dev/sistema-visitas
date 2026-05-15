import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function readDb() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function now() {
  return new Date().toISOString();
}

function onlySellerRecords(records, user) {
  if (!user || user.perfil === 'Administrador') return records;
  return records.filter((record) => record.vendedorId === user.id);
}

function getUserFromReq(db, req) {
  const id = req.headers['x-user-id'];
  return db.usuarios.find((u) => u.id === id) || null;
}

function calcularDuracao(checkinHora, checkoutHora) {
  if (!checkinHora || !checkoutHora) return null;
  const inicio = new Date(checkinHora).getTime();
  const fim = new Date(checkoutHora).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 60000);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API de visitas comerciais online' });
});

app.post('/api/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const db = await readDb();
  const user = db.usuarios.find(
    (u) => u.usuario?.toLowerCase() === String(usuario || '').toLowerCase() && u.senha === senha
  );

  if (!user) {
    return res.status(401).json({ sucesso: false, erro: 'Usuário ou senha inválidos.' });
  }

  const { senha: _, ...safeUser } = user;
  res.json({ sucesso: true, usuario: safeUser });
});

app.get('/api/usuarios', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user || user.perfil !== 'Administrador') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  res.json(db.usuarios.map(({ senha, ...u }) => u));
});

app.post('/api/usuarios', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user || user.perfil !== 'Administrador') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }

  const payload = req.body;
  if (!payload.nome || !payload.usuario || !payload.senha || !payload.perfil) {
    return res.status(400).json({ erro: 'Informe nome, usuário, senha e perfil.' });
  }

  if (db.usuarios.some((u) => u.usuario.toLowerCase() === payload.usuario.toLowerCase())) {
    return res.status(400).json({ erro: 'Login de usuário já cadastrado.' });
  }

  const novo = {
    id: `user_${nanoid(8)}`,
    nome: payload.nome,
    usuario: payload.usuario,
    senha: payload.senha,
    perfil: payload.perfil,
    email: payload.email || ''
  };
  db.usuarios.push(novo);
  await writeDb(db);
  const { senha, ...safe } = novo;
  res.status(201).json(safe);
});

app.get('/api/clientes', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const termo = String(req.query.q || '').toLowerCase();
  const status = String(req.query.status || '');
  const vendedorId = String(req.query.vendedorId || '');

  let clientes = onlySellerRecords(db.clientes, user);
  if (termo) {
    clientes = clientes.filter((c) =>
      [c.razaoSocial, c.nomeFantasia, c.cnpj, c.cidade, c.segmento, c.contato]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    );
  }
  if (status) clientes = clientes.filter((c) => c.status === status);
  if (vendedorId && user.perfil === 'Administrador') clientes = clientes.filter((c) => c.vendedorId === vendedorId);

  res.json(clientes.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia)));
});

app.post('/api/clientes', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const payload = req.body;
  if (!payload.razaoSocial && !payload.nomeFantasia) {
    return res.status(400).json({ erro: 'Informe razão social ou nome fantasia.' });
  }

  const novo = {
    id: `cli_${nanoid(8)}`,
    razaoSocial: payload.razaoSocial || payload.nomeFantasia,
    nomeFantasia: payload.nomeFantasia || payload.razaoSocial,
    cnpj: payload.cnpj || '',
    segmento: payload.segmento || '',
    cidade: payload.cidade || '',
    estado: payload.estado || '',
    endereco: payload.endereco || '',
    contato: payload.contato || '',
    cargoContato: payload.cargoContato || '',
    telefone: payload.telefone || '',
    email: payload.email || '',
    vendedorId: user.perfil === 'Administrador' ? payload.vendedorId || user.id : user.id,
    status: payload.status || 'Prospect',
    potencial: payload.potencial || 'Médio',
    observacoes: payload.observacoes || '',
    criadoEm: now(),
    atualizadoEm: now()
  };

  db.clientes.push(novo);
  await writeDb(db);
  res.status(201).json(novo);
});

app.put('/api/clientes/:id', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const idx = db.clientes.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  if (user.perfil !== 'Administrador' && db.clientes[idx].vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Você não pode editar este cliente.' });
  }

  db.clientes[idx] = { ...db.clientes[idx], ...req.body, atualizadoEm: now() };
  await writeDb(db);
  res.json(db.clientes[idx]);
});

app.delete('/api/clientes/:id', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user || user.perfil !== 'Administrador') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  db.clientes = db.clientes.filter((c) => c.id !== req.params.id);
  db.visitas = db.visitas.filter((v) => v.clienteId !== req.params.id);
  await writeDb(db);
  res.json({ sucesso: true });
});

app.get('/api/visitas', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  let visitas = onlySellerRecords(db.visitas, user);
  const status = String(req.query.status || '');
  const data = String(req.query.data || '');
  const vendedorId = String(req.query.vendedorId || '');

  if (status) visitas = visitas.filter((v) => v.status === status);
  if (data) visitas = visitas.filter((v) => v.dataAgendada === data);
  if (vendedorId && user.perfil === 'Administrador') visitas = visitas.filter((v) => v.vendedorId === vendedorId);

  const enriched = visitas.map((v) => ({
    ...v,
    cliente: db.clientes.find((c) => c.id === v.clienteId) || null,
    vendedor: db.usuarios.find((u) => u.id === v.vendedorId)?.nome || ''
  }));

  res.json(enriched.sort((a, b) => `${a.dataAgendada} ${a.horaAgendada}`.localeCompare(`${b.dataAgendada} ${b.horaAgendada}`)));
});

app.post('/api/visitas', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const payload = req.body;
  if (!payload.clienteId || !payload.dataAgendada || !payload.horaAgendada) {
    return res.status(400).json({ erro: 'Informe cliente, data e horário.' });
  }

  const cliente = db.clientes.find((c) => c.id === payload.clienteId);
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  if (user.perfil !== 'Administrador' && cliente.vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Cliente não pertence à sua carteira.' });
  }

  const novo = {
    id: `vis_${nanoid(8)}`,
    clienteId: payload.clienteId,
    vendedorId: user.perfil === 'Administrador' ? payload.vendedorId || cliente.vendedorId : user.id,
    dataAgendada: payload.dataAgendada,
    horaAgendada: payload.horaAgendada,
    tipoVisita: payload.tipoVisita || 'Prospecção',
    status: payload.status || 'Agendada',
    checkinHora: null,
    checkoutHora: null,
    duracaoMinutos: null,
    quemAtendeu: '',
    cargoContato: '',
    resumo: '',
    necessidade: '',
    produtoInteresse: '',
    potencialCompra: payload.potencialCompra || cliente.potencial || 'Médio',
    proximaAcao: '',
    proximaData: '',
    observacoes: payload.observacoes || '',
    criadoEm: now(),
    atualizadoEm: now()
  };

  db.visitas.push(novo);
  await writeDb(db);
  res.status(201).json(novo);
});

app.put('/api/visitas/:id', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const idx = db.visitas.findIndex((v) => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (user.perfil !== 'Administrador' && db.visitas[idx].vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Você não pode editar esta visita.' });
  }

  const atualizada = { ...db.visitas[idx], ...req.body, atualizadoEm: now() };
  atualizada.duracaoMinutos = calcularDuracao(atualizada.checkinHora, atualizada.checkoutHora);
  db.visitas[idx] = atualizada;

  if (req.body.statusCliente) {
    const cliIdx = db.clientes.findIndex((c) => c.id === atualizada.clienteId);
    if (cliIdx >= 0) {
      db.clientes[cliIdx].status = req.body.statusCliente;
      db.clientes[cliIdx].atualizadoEm = now();
    }
  }

  await writeDb(db);
  res.json(db.visitas[idx]);
});

app.post('/api/visitas/:id/checkin', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const idx = db.visitas.findIndex((v) => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (user.perfil !== 'Administrador' && db.visitas[idx].vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Você não pode alterar esta visita.' });
  }

  db.visitas[idx].checkinHora = now();
  db.visitas[idx].status = 'Em andamento';
  db.visitas[idx].atualizadoEm = now();
  await writeDb(db);
  res.json(db.visitas[idx]);
});

app.post('/api/visitas/:id/checkout', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const idx = db.visitas.findIndex((v) => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (user.perfil !== 'Administrador' && db.visitas[idx].vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Você não pode alterar esta visita.' });
  }

  db.visitas[idx].checkoutHora = now();
  db.visitas[idx].status = 'Realizada';
  db.visitas[idx].duracaoMinutos = calcularDuracao(db.visitas[idx].checkinHora, db.visitas[idx].checkoutHora);
  db.visitas[idx].atualizadoEm = now();
  await writeDb(db);
  res.json(db.visitas[idx]);
});

app.delete('/api/visitas/:id', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });
  const visita = db.visitas.find((v) => v.id === req.params.id);
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (user.perfil !== 'Administrador' && visita.vendedorId !== user.id) {
    return res.status(403).json({ erro: 'Você não pode excluir esta visita.' });
  }
  db.visitas = db.visitas.filter((v) => v.id !== req.params.id);
  await writeDb(db);
  res.json({ sucesso: true });
});

app.get('/api/dashboard', async (req, res) => {
  const db = await readDb();
  const user = getUserFromReq(db, req);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  const hoje = new Date().toISOString().slice(0, 10);
  const visitas = onlySellerRecords(db.visitas, user);
  const clientes = onlySellerRecords(db.clientes, user);

  const porVendedor = db.usuarios
    .filter((u) => u.perfil === 'Vendedor' || u.perfil === 'Administrador')
    .map((u) => ({
      vendedorId: u.id,
      nome: u.nome,
      visitas: visitas.filter((v) => v.vendedorId === u.id).length,
      realizadas: visitas.filter((v) => v.vendedorId === u.id && v.status === 'Realizada').length
    }))
    .filter((item) => user.perfil === 'Administrador' || item.vendedorId === user.id);

  res.json({
    totalClientes: clientes.length,
    clientesAtivos: clientes.filter((c) => c.status === 'Cliente ativo').length,
    prospects: clientes.filter((c) => c.status === 'Prospect').length,
    visitasHoje: visitas.filter((v) => v.dataAgendada === hoje).length,
    visitasAgendadas: visitas.filter((v) => v.status === 'Agendada').length,
    visitasRealizadas: visitas.filter((v) => v.status === 'Realizada').length,
    visitasPendentes: visitas.filter((v) => ['Agendada', 'Reagendada', 'Em andamento'].includes(v.status)).length,
    porVendedor,
    proximasVisitas: visitas
      .filter((v) => ['Agendada', 'Reagendada', 'Em andamento'].includes(v.status))
      .map((v) => ({
        ...v,
        cliente: db.clientes.find((c) => c.id === v.clienteId)?.nomeFantasia || 'Cliente não encontrado'
      }))
      .sort((a, b) => `${a.dataAgendada} ${a.horaAgendada}`.localeCompare(`${b.dataAgendada} ${b.horaAgendada}`))
      .slice(0, 8)
  });
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
