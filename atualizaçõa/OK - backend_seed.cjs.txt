const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const senhaAdmin = await bcrypt.hash('admin123', 10)
  const senhaVendedor = await bcrypt.hash('1234', 10)

  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {
      nome: 'Administrador',
      senhaHash: senhaAdmin,
      perfil: 'Administrador',
      email: 'admin@empresa.com',
      ativo: true
    },
    create: {
      nome: 'Administrador',
      usuario: 'admin',
      senhaHash: senhaAdmin,
      perfil: 'Administrador',
      email: 'admin@empresa.com',
      ativo: true
    }
  })

  const vendedor = await prisma.usuario.upsert({
    where: { usuario: 'vendedor' },
    update: {
      nome: 'Vendedor Externo',
      senhaHash: senhaVendedor,
      perfil: 'Vendedor',
      email: 'vendedor@empresa.com',
      ativo: true
    },
    create: {
      nome: 'Vendedor Externo',
      usuario: 'vendedor',
      senhaHash: senhaVendedor,
      perfil: 'Vendedor',
      email: 'vendedor@empresa.com',
      ativo: true
    }
  })

  console.log('Seed executado com sucesso.')
  console.log('Admin: admin / admin123')
  console.log('Vendedor: vendedor / 1234')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
