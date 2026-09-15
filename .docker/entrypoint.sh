#!/bin/sh

set -eu

# BACKUP_FILE="${BACKUP_FILE:-./backup.sql}"

# public_table_count() {
#   psql "$DATABASE_URL" -tAc \
#     "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
# }

# restore_backup_if_needed() {
#   if [ "${SKIP_BACKUP_RESTORE:-0}" = "1" ]; then
#     echo "SKIP_BACKUP_RESTORE=1 — pulando restauração do backup."
#     return 0
#   fi

#   if [ ! -f "$BACKUP_FILE" ]; then
#     echo "Backup não encontrado em $BACKUP_FILE — seguindo sem restaurar."
#     return 0
#   fi

#   table_count="$(public_table_count || echo 0)"
#   table_count="$(echo "$table_count" | tr -d '[:space:]')"

#   if [ -n "$table_count" ] && [ "$table_count" -gt 0 ]; then
#     echo "Banco já possui $table_count tabela(s) — pulando restauração do backup."
#     return 0
#   fi

#   echo "Banco vazio — restaurando $BACKUP_FILE..."
#   # \restrict/\unrestrict vêm do pg_dump 18; remove para compatibilidade com o client
#   sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$BACKUP_FILE" \
#     | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
#   echo "Backup restaurado com sucesso."
# }

# restore_backup_if_needed

echo "Aplicando migrations..."
npx prisma migrate deploy

exec node dist/main.js
