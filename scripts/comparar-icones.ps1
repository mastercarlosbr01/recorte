<#
    Compara candidatos a icone no tamanho que importa: 16x16.

    Gera 128/48/16 de cada, e uma ampliacao NearestNeighbor do 16 para dar
    para enxergar pixel a pixel o que sobra da arte. Julgar icone olhando a
    imagem de 1024 e como escolher fonte olhando so o titulo.

    Uso:
      powershell -ExecutionPolicy Bypass -File scripts\comparar-icones.ps1 -Pasta "C:\...\Downloads\icon"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Pasta
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$saida = Join-Path $raiz "dist\comparacao"
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory -Path $saida -Force | Out-Null

function Redimensionar {
    param([System.Drawing.Image]$img, [int]$lado, [string]$modo = "HighQualityBicubic")

    $bmp = New-Object System.Drawing.Bitmap($lado, $lado)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::$modo
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    if ($modo -eq "NearestNeighbor") {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    } else {
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    }
    $g.DrawImage($img, 0, 0, $lado, $lado)
    $g.Dispose()
    return $bmp
}

# reducao escalonada preserva forma; salto unico borra
function ReduzirEscalonado {
    param([System.Drawing.Image]$img, [int]$alvo)

    $atual = $img
    $lixo = @()
    $tam = $img.Width
    while ($tam / 2 -gt $alvo) {
        $tam = [Math]::Floor($tam / 2)
        $novo = Redimensionar -img $atual -lado $tam
        $lixo += $novo
        $atual = $novo
    }
    $final = Redimensionar -img $atual -lado $alvo
    foreach ($t in $lixo) { $t.Dispose() }
    return $final
}

$arquivos = Get-ChildItem "$Pasta\*" -Include *.png, *.jpeg, *.jpg
if ($arquivos.Count -eq 0) { Write-Error "Nenhuma imagem em $Pasta"; exit 1 }

$cartoes = @()
$letra = 65  # 'A'

foreach ($arq in $arquivos) {
    $rotulo = [char]$letra
    $letra++
    $pastaItem = Join-Path $saida $rotulo
    New-Item -ItemType Directory -Path $pastaItem -Force | Out-Null

    $orig = [System.Drawing.Image]::FromFile($arq.FullName)
    Write-Host ""
    Write-Host "  [$rotulo] $($arq.Name)  ($($orig.Width)x$($orig.Height))"

    foreach ($lado in 128, 48, 16) {
        $img = ReduzirEscalonado -img $orig -alvo $lado
        $img.Save((Join-Path $pastaItem "icone-$lado.png"), [System.Drawing.Imaging.ImageFormat]::Png)

        # amplia o 16 sem suavizar, para enxergar cada pixel
        if ($lado -eq 16) {
            $zoom = Redimensionar -img $img -lado 320 -modo "NearestNeighbor"
            $zoom.Save((Join-Path $pastaItem "zoom-16.png"), [System.Drawing.Imaging.ImageFormat]::Png)
            $zoom.Dispose()
        }
        $img.Dispose()
        Write-Host "      $lado px  ok"
    }
    $orig.Dispose()
    $cartoes += [PSCustomObject]@{ Rotulo = $rotulo; Arquivo = $arq.Name }
}

# ------------------------------------------------------------ pagina

$blocos = ($cartoes | ForEach-Object {
@"
    <section class="cartao">
      <h2>$($_.Rotulo)</h2>
      <p class="arq">$($_.Arquivo)</p>
      <div class="zoom"><img src="$($_.Rotulo)/zoom-16.png" alt="16px ampliado"></div>
      <div class="reais">
        <figure><img src="$($_.Rotulo)/icone-16.png" width="16" height="16"><figcaption>16 real</figcaption></figure>
        <figure><img src="$($_.Rotulo)/icone-48.png" width="48" height="48"><figcaption>48</figcaption></figure>
        <figure><img src="$($_.Rotulo)/icone-128.png" width="128" height="128"><figcaption>128</figcaption></figure>
      </div>
      <div class="barras">
        <div class="barra clara"><img src="$($_.Rotulo)/icone-16.png" width="16" height="16"><span>barra clara</span></div>
        <div class="barra escura"><img src="$($_.Rotulo)/icone-16.png" width="16" height="16"><span>barra escura</span></div>
      </div>
    </section>
"@
}) -join "`n"

$html = @"
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Ficta — comparação de ícones</title>
<style>
 body{margin:0;padding:28px;background:#0f172a;color:#e6edf6;
      font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 h1{font-size:20px;margin:0 0 4px}
 .dica{color:#93a4bd;margin:0 0 24px;font-size:13px}
 .grade{display:flex;gap:20px;flex-wrap:wrap}
 .cartao{background:#1a2436;border:1px solid #2c3a52;border-radius:10px;padding:16px;min-width:360px}
 h2{margin:0;font-size:15px;color:#06b6d4}
 .arq{margin:2px 0 12px;font-size:11px;color:#64748b;font-family:ui-monospace,Consolas,monospace}
 .zoom img{width:320px;height:320px;image-rendering:pixelated;border-radius:6px;display:block}
 .reais{display:flex;gap:18px;align-items:flex-end;margin:16px 0 4px}
 figure{margin:0;text-align:center}
 figcaption{font-size:10px;color:#64748b;margin-top:5px}
 .barras{display:flex;gap:10px;margin-top:14px}
 .barra{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;font-size:11px}
 .clara{background:#f1f3f4;color:#3c4043}
 .escura{background:#292a2d;color:#e8eaed}
</style></head><body>
<h1>Ficta — qual ícone sobrevive a 16px</h1>
<p class="dica">O bloco grande é o ícone de 16px ampliado sem suavização: é literalmente o que o Chrome desenha. As barras no fim simulam a toolbar clara e escura.</p>
<div class="grade">
$blocos
</div>
</body></html>
"@

$paginaPath = Join-Path $saida "index.html"
[System.IO.File]::WriteAllText($paginaPath, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "  pagina: dist\comparacao\index.html"
Write-Host ""
