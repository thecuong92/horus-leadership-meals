@echo off
title Deploy Horus Leadership Meals Len Cloudflare Workers + D1 Database
color 0b
echo =========================================================================
echo   DEPLOY HORUS LEADERSHIP MEALS LEN CLOUDFLARE CLOUD (WORKERS + D1 DB)
echo =========================================================================
echo.
echo 1. Dang build giao dien web va dong goi API Worker...
call node scripts/build-cf.mjs
echo.
echo 2. Dang deploy len Cloudflare Workers + D1 Database (APAC)...
call npx.cmd wrangler deploy
echo.
echo =========================================================================
echo   DEPLOY HOAN TAT!
echo =========================================================================
pause
