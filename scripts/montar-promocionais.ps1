<#
    Monta os dois blocos promocionais da Chrome Web Store.

      pequeno  440 x 280    aparece em listagens e em destaques pequenos
      letreiro 1400 x 560   aparece se a loja destacar a extensao

    Os dois sao opcionais. Sao feitos aqui porque custam pouco e uma ficha
    com os campos vazios parece abandonada ao lado das concorrentes.

    Formato de saida: PNG de 24 bits SEM alfa, que e o que a loja exige.
    System.Drawing cria bitmap com alfa por padrao; o Format24bppRgb abaixo
    e o que garante a exigencia.

    Uso:
      powershell -ExecutionPolicy Bypass -File scripts\montar-promocionais.ps1
#>

param(
    [string]$Destino = "dist\promocionais"
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$saida = Join-Path $raiz $Destino
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory -Path $saida -Force | Out-Null

$NAVY  = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
$CIANO = [System.Drawing.ColorTranslator]::FromHtml("#06B6D4")
$TEXTO = [System.Drawing.ColorTranslator]::FromHtml("#E6EDF6")
$FRACO = [System.Drawing.ColorTranslator]::FromHtml("#93A4BD")

$icone = [System.Drawing.Image]::FromFile((Join-Path $raiz "assets\icone-128.png"))

function Montar {
    param([int]$Largura, [int]$Altura, [string]$Arquivo)

    # proporcoes derivadas da altura: o mesmo desenho serve nos dois tamanhos
    $u = $Altura / 280.0

    $canvas = New-Object System.Drawing.Bitmap($Largura, $Altura, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($NAVY)

    # faixa ciano na borda esquerda: o unico elemento de marca alem do icone
    $faixa = New-Object System.Drawing.SolidBrush($CIANO)
    $g.FillRectangle($faixa, 0, 0, [int](6 * $u), $Altura)

    $margem = [int](34 * $u)
    $ladoIcone = [int](96 * $u)
    $vao = [int](26 * $u)

    $fNome = New-Object System.Drawing.Font("Segoe UI", (30 * $u), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fLinha = New-Object System.Drawing.Font("Segoe UI", (17 * $u), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $fFormatos = New-Object System.Drawing.Font("Consolas", (16 * $u), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $pNome = New-Object System.Drawing.SolidBrush($TEXTO)
    $pFraco = New-Object System.Drawing.SolidBrush($FRACO)
    $pCiano = New-Object System.Drawing.SolidBrush($CIANO)

    $frase = "Exporte a seleção da página como arquivo, já formatado."
    $formatos = ".json   .xml   .txt"

    # a largura do texto é a da frase, que é a linha mais larga das três
    $larguraTexto = [Math]::Ceiling($g.MeasureString($frase, $fLinha).Width)
    $larguraMaxima = $Largura - (2 * $margem) - $ladoIcone - $vao
    if ($larguraTexto -gt $larguraMaxima) { $larguraTexto = $larguraMaxima }

    # o bloco inteiro — ícone, vão e texto — centrado na arte
    $larguraBloco = $ladoIcone + $vao + $larguraTexto
    $inicio = [int](($Largura - $larguraBloco) / 2)
    $g.DrawImage($icone, $inicio, [int](($Altura - $ladoIcone) / 2), $ladoIcone, $ladoIcone)
    $x = $inicio + $ladoIcone + $vao

    $alturaNome = $g.MeasureString("Recorte", $fNome).Height
    $alturaFrase = $g.MeasureString($frase, $fLinha, [int]$larguraTexto).Height
    $alturaFormatos = $g.MeasureString($formatos, $fFormatos).Height

    # $10 aqui era variável vazia, não o número dez: o bloco inteiro descia
    $total = $alturaNome + (6 * $u) + $alturaFrase + (14 * $u) + $alturaFormatos
    $y = ($Altura - $total) / 2

    $g.DrawString("Recorte", $fNome, $pNome, [single]$x, [single]$y)
    $y += $alturaNome + (6 * $u)

    $ret = New-Object System.Drawing.RectangleF($x, $y, $larguraTexto, $alturaFrase)
    $g.DrawString($frase, $fLinha, $pFraco, $ret)
    $y += $alturaFrase + (14 * $u)

    $g.DrawString($formatos, $fFormatos, $pCiano, [single]$x, [single]$y)

    $g.Dispose()
    $destino = Join-Path $saida $Arquivo
    $canvas.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()

    $kb = [Math]::Round((Get-Item $destino).Length / 1KB, 1)
    Write-Host "  $Arquivo  ${Largura}x${Altura}  $kb KB"
}

Montar -Largura 440 -Altura 280 -Arquivo "promo-pequeno-440x280.png"
Montar -Largura 1400 -Altura 560 -Arquivo "promo-letreiro-1400x560.png"

$icone.Dispose()

Write-Host ""
Write-Host "  prontos em $Destino - os dois sao opcionais na ficha"
