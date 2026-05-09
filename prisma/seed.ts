import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Chains ──────────────────────────────────────────────────────
  console.log('  → Seeding chains...')
  await prisma.chain.upsert({
    where: { id: 'shufersal' },
    update: {},
    create: {
      id: 'shufersal',
      nameHe: 'שופרסל',
      xmlUrl: 'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0',
    },
  })

  await prisma.chain.upsert({
    where: { id: 'rami-levy' },
    update: {},
    create: {
      id: 'rami-levy',
      nameHe: 'רמי לוי',
      xmlUrl: 'https://url.retail.publishedprices.co.il/ramilevy/pricing',
    },
  })

  await prisma.chain.upsert({
    where: { id: 'victory' },
    update: {},
    create: {
      id: 'victory',
      nameHe: 'ויקטורי',
      xmlUrl: 'https://matrixcatalog.co.il/NBCompetitionData.aspx',
    },
  })

  console.log('  ✅ Chains seeded (3 chains)')

  // ─── Default Categories ──────────────────────────────────────────
  console.log('  → Seeding default categories...')

  const defaultCategories = [
    { id: 'cat-produce',   nameHe: 'פירות וירקות',  nameEn: 'Produce',       emoji: '🥦', color: '#4CAF50' },
    { id: 'cat-dairy',     nameHe: 'חלב וגבינות',   nameEn: 'Dairy',         emoji: '🥛', color: '#2196F3' },
    { id: 'cat-meat',      nameHe: 'בשר ודגים',     nameEn: 'Meat & Fish',   emoji: '🥩', color: '#F44336' },
    { id: 'cat-bakery',    nameHe: 'מאפים',          nameEn: 'Bakery',        emoji: '🍞', color: '#FF9800' },
    { id: 'cat-frozen',    nameHe: 'קפואים',         nameEn: 'Frozen',        emoji: '🧊', color: '#00BCD4' },
    { id: 'cat-beverages', nameHe: 'משקאות',         nameEn: 'Beverages',     emoji: '🥤', color: '#9C27B0' },
    { id: 'cat-snacks',    nameHe: 'חטיפים',         nameEn: 'Snacks',        emoji: '🍿', color: '#FF5722' },
    { id: 'cat-cleaning',  nameHe: 'ניקיון',         nameEn: 'Cleaning',      emoji: '🧹', color: '#607D8B' },
    { id: 'cat-personal',  nameHe: 'טיפוח אישי',    nameEn: 'Personal Care', emoji: '🧴', color: '#E91E63' },
    { id: 'cat-other',     nameHe: 'אחר',            nameEn: 'Other',         emoji: '🛒', color: '#9E9E9E' },
  ]

  for (const cat of defaultCategories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: {
        id: cat.id,
        userId: null, // global defaults (no user)
        nameHe: cat.nameHe,
        nameEn: cat.nameEn,
        emoji: cat.emoji,
        color: cat.color,
      },
    })
  }

  console.log(`  ✅ Default categories seeded (${defaultCategories.length} categories)`)
  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
