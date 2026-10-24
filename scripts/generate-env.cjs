const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('.env already exists - skipping creation');
  process.exit(0);
}

const secret = crypto.randomBytes(32).toString('base64');
const content = [
  '# WebRadio Website - Local Development Environment',
  '# Generated: ' + new Date().toISOString().slice(0, 10),
  '# DO NOT COMMIT THIS FILE. It is listed in .gitignore.',
  '',
  '# Database (Required)',
  '# Set your PostgreSQL connection string here.',
  '# Example: postgresql://postgres:password@localhost:5432/webradio_dev',
  'DATABASE_URL=""',
  '',
  '# NextAuth (Required)',
  '# Generated automatically - change only to invalidate all sessions.',
  'NEXTAUTH_SECRET="' + secret + '"',
  'NEXTAUTH_URL="http://localhost:3000"',
  '',
  '# Node Environment',
  'NODE_ENV="development"',
].join('\n');

fs.writeFileSync(envPath, content, 'utf8');
console.log('Created .env with a freshly generated NEXTAUTH_SECRET.');
console.log('DATABASE_URL is empty - set it to your PostgreSQL connection string.');
