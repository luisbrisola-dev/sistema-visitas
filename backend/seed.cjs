const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const senhaAdmin = await bcrypt.hash('admin123', 10)
  const senhaVendedor = await bcrypt.hash('1234', 10)

  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: { nome: 'Administrador', perfil: 'Administrador', ativo: true },
    create: {
      nome: 'Administrador',
      usuario: 'admin',
      email: 'admin@empresa.com.br',
      perfil: 'Administrador',
      senhaHash: senhaAdmin,
      ativo: true
    }
  })

  const vendedor = await prisma.usuario.upsert({
    where: { usuario: 'vendedor' },
    update: { nome: 'Vendedor Externo', perfil: 'Vendedor', ativo: true },
    create: {
      nome: 'Vendedor Externo',
      usuario: 'vendedor',
      email: 'vendedor@empresa.com.br',
      perfil: 'Vendedor',
      senhaHash: senhaVendedor,
      ativo: true
    }
  })

  const cliente = await prisma.cliente.upsert({
    where: { id: 'cliente_demo_001' },
    update: {},
    create: {
      id: 'cliente_demo_001',
      razaoSocial: 'ABC Indústria Ltda',
      nomeFantasia: 'ABC Indústria',
      cnpj: '00.000.000/0001-00',
      segmento: 'Indústria',
      cidade: 'São José dos Campos',
      estado: 'SP',
      contato: 'Compras',
      telefone: '(12) 99999-9999',
      email: 'compras@abc.com.br',
      vendedorId: vendedor.id,
      status: 'Em prospecção',
      potencial: 'Alto',
      observacoes: 'Cliente demonstrativo para validação do funil.'
    }
  })

  const oportunidade = await prisma.oportunidade.upsert({
    where: { id: 'opp_demo_001' },
    update: {},
    create: {
      id: 'opp_demo_001',
      clienteId: cliente.id,
      vendedorId: vendedor.id,
      titulo: 'Fornecimento de embalagens para linha atual',
      etapa: 'Contato realizado',
      status: 'Aberta',
      origem: 'Prospecção ativa',
      descricao: 'Primeira oportunidade comercial registrada no novo modelo de CRM.',
      proximaAcao: 'Agendar reunião de diagnóstico',
      proximaData: new Date().toISOString().slice(0, 10)
    }
  })

  await prisma.atividade.create({
    data: {
      clienteId: cliente.id,
      oportunidadeId: oportunidade.id,
      responsavelId: vendedor.id,
      tipo: 'Ligação',
      data: new Date().toISOString().slice(0, 10),
      resumo: 'Contato inicial realizado. Cliente solicitou apresentação da solução.',
      etapaApos: 'Contato realizado',
      proximaAcao: 'Enviar apresentação institucional'
    }
  })

  console.log('Seed executado com sucesso.')
  console.log('Admin: admin / admin123')
  console.log('Vendedor: vendedor / 1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
