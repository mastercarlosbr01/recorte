<#
    Converte uma imagem grande (a que a IA gerou) nos tres tamanhos que a
    Chrome Web Store exige: 128, 48 e 16.

    Reduzir 1024 -> 16 de uma vez borra tudo. Aqui a reducao e feita em
    etapas, com interpolacao de alta qualidade, que preserva bem mais a
    forma nos tamanhos pequenos.

    Uso:
      powershell -ExecutionPolicy Bypass -File scripts\converter-icone.ps1 -Origem "C:\caminho\icone.png"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Origem,

    [string]$Destino = "assets"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Origem)) {
    Write-Error "Nao encontrei: $Origem"
    exit 1
}

$raiz = Split-Path -Parent $PSScriptRoot
$pastaDestino = Join-Path $raiz $Destino
if (-not (Test-Path $pastaDestino)) {
    New-Item -ItemType Directory -Path $pastaDestino -Force | Out-Null
}

$original = [System.Drawing.Image]::FromFile((Resolve-Path $Origem))
Write-Host ""
Write-Host "  origem: $($original.Width)x$($original.Height)"

if ($original.Width -ne $original.Height) {
    Write-Warning "  imagem nao e quadrada - vai distorcer. Recorte antes."
}

function Resize-Etapa {
    param([System.Drawing.Image]$img, [int]$lado)

    $bmp = New-Object System.Drawing.Bitmap($lado, $lado)
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $lado, $lado)
    $g.Dispose()
    return $bmp
}

foreach ($lado in 128, 48, 16) {
    # reduz em etapas: 1024 -> 256 -> 64 -> 16 preserva forma melhor que um salto so
    $atual = $original
    $temporarios = @()

    $etapas = @()
    $tamanho = $original.Width
    while ($tamanho / 2 -gt $lado) {
        $tamanho = [Math]::Floor($tamanho / 2)
        $etapas += $tamanho
    }

    foreach ($etapa in $etapas) {
        $novo = Resize-Etapa -img $atual -lado $etapa
        $temporarios += $novo
        $atual = $novo
    }

    $final = Resize-Etapa -img $atual -lado $lado
    $arquivo = Join-Path $pastaDestino "icone-$lado.png"
    $final.Save($arquivo, [System.Drawing.Imaging.ImageFormat]::Png)
    $final.Dispose()
    foreach ($t in $temporarios) { $t.Dispose() }

    $kb = [Math]::Round((Get-Item $arquivo).Length / 1KB, 1)
    $relativo = $arquivo.Substring($raiz.Length).TrimStart('\', '/')
    Write-Host "  gerado: $relativo  ($kb KB)"
}

$original.Dispose()

Write-Host ""
Write-Host "  Pronto. Confira o de 16 em tamanho real antes de publicar:"
Write-Host "  se voce nao distingue o que e, o icone nao serve."
Write-Host ""
