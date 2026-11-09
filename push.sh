#!/usr/bin/env bash
# Пуш SGAX в GitHub. Запуск:
#   GITHUB_TOKEN=ghp_xxx ./push.sh git@github.com:USER/REPO.git
#   GITHUB_TOKEN=ghp_xxx ./push.sh https://github.com/USER/REPO.git
set -euo pipefail

REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "Укажи репозиторий: ./push.sh https://github.com/USER/REPO.git"
  exit 1
fi
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Не задан GITHUB_TOKEN. Пример: GITHUB_TOKEN=ghp_xxx ./push.sh https://github.com/USER/REPO.git"
  exit 1
fi

# https://github.com/USER/REPO.git -> https://TOKEN@github.com/USER/REPO.git
URL="$REPO"
case "$REPO" in
  https://*) URL="https://${GITHUB_TOKEN}@${REPO#https://}" ;;
  git@*)     URL="https://${GITHUB_TOKEN}@${REPO#git@}"; URL="${URL/:/\/}" ;;
esac

git remote remove origin 2>/dev/null || true
git remote add origin "$URL"
git branch -M main 2>/dev/null || true

echo "→ Пушу в $REPO …"
git push -u origin main

# прячем токен из конфига, чтобы не остался в файле
git remote set-url origin "$REPO"
echo "✓ Готово. Токен из .git/config убран."
