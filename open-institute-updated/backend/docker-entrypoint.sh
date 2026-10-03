#!/bin/sh
set -e
npx prisma migrate deploy
npm run prisma:seed
mkdir -p "${UPLOAD_DIR:-/app/uploads}"
exec npm run start
