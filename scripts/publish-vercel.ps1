# Deploy na Vercel + dominio (requer: npx vercel login)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Deploy de producao..."
npx vercel --prod --yes

Write-Host @"

Proximos passos no dashboard Vercel:
1. Settings -> Environment Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
2. Settings -> Domains: myrep.com.br e www.myrep.com.br
3. No registrador do dominio, aponte DNS conforme instrucoes da Vercel

"@
