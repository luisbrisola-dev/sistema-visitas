import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminSenha = await bcrypt.hash('admin123', 10);
  const vendedorSenha = await bcrypt.hash('1234', 10);

  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: { senhaHash: adminSenha, perfil: 'Administrador', ativo: true },
    create: { nome: 'Administrador', usuario: 'admin', senhaHash: adminSenha, perfil: 'Administrador', email: 'admin@empresa.com.br' }
  });

  const vendedor = await prisma.usuario.upsert({
    where: { usuario: 'vendedor' },
    update: { senhaHash: vendedorSenha, perfil: 'Vendedor', ativo: true },
    create: { nome: 'Vendedor Externo', usuario: 'vendedor', senhaHash: vendedorSenha, perfil: 'Vendedor', email: 'vendedor@empresa.com.br' }
  });

  const cliente = await prisma.cliente.create({
    data: {
      razaoSocial: 'Cliente Demonstração Ltda',
      nomeFantasia: 'Cliente Demonstração',
      cnpj: '00.000.000/0001-00',
      segmento: 'Indústria',
      cidade: 'São José dos Campos',
      estado: 'SP',
      contato: 'Contato Comercial',
      telefone: '(12) 99999-9999',
      email: 'contato@cliente.com.br',
      vendedorId: vendedor.id,
      status: 'Prospect',
      potencial: 'Médio',
      observacoes: 'Cliente criado automaticamente para teste inicial.'
    }
  });

  await prisma.visita.create({
    data: {
      clienteId: cliente.id,
      vendedorId: vendedor.id,
      dataAgendada: new Date().toISOString().slice(0, 10),
      horaAgendada: '09:00',
      tipoVisita: 'Prospecção',
      status: 'Agendada',
      potencialCompra: 'Médio',
      observacoes: 'Visita criada automaticamente para teste inicial.'
    }
  });

  console.log('Seed concluído:', { admin: admin.usuario, vendedor: vendedor.usuario });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
